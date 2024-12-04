import express from 'express';
import { ExpressAuth } from '@auth/express';
import { getSession } from '@auth/express';
import Discord from '@auth/express/providers/discord';
import Credentials from '@auth/express/providers/credentials';
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./schema.js";
import bcrypt from 'bcrypt';
import { users, sessions, products, productReviews, productImages, productFeatures, orders, orderItems } from './schema.js';
import { eq, sql, avg, count, desc, inArray, and, asc } from 'drizzle-orm';
import { v4 as uuid } from "uuid";
import cors from 'cors';
import { createRouteHandler } from "uploadthing/express";
import { uploadRouter } from "./uploadthing.js";
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import { PasswordResetEmailTemplate } from './email-templates/password-reset.js';
import { AdminQuestionEmail } from './email-templates/question.js';

let stripe = Stripe(process.env.STRIPE_SECRET);

const app = express();
const port = 8080;

app.use(cors({
  origin: 'http://localhost:8080',
  methods: '*',
  credentials: true,
}));

app.set('view engine', 'ejs');
app.set('trust proxy', true);

const authConfig = {
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await db.select().from(users).where(eq(users.email, credentials.email)).limit(1);

          if (!user || user.length === 0) {
            throw new Error('UserNotFound');
          }

          const foundUser = user[0];

          if (!foundUser?.password) {
            throw new Error('PasswordNotSet');
          }

          const storedHash = foundUser.password;

          const validPassword = await bcrypt.compare(credentials.password, storedHash);

          if (!validPassword) {
            throw new Error('InvalidCredentials');
          }

          const { ...userWithoutPassword } = foundUser;

          return userWithoutPassword;
        } catch (error) {
          console.error('Authorization error:', error);
          return null;
        }
      },
    }),
    Discord({
      clientId: process.env.DISCORD_ID,
      clientSecret: process.env.DISCORD_SECRET
    })
  ],

  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "credentials") {
        token.credentials = true;
      }
      return token;
    },
    async session({ session, user }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
        },
      };
    },
  },
  jwt: {
    encode: async function (params) {
      if (params.token?.credentials) {
        const sessionToken = uuid();
        //expires in 1 day
        const expiresAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);

        await db.insert(sessions).values({
          sessionToken: sessionToken,
          userId: params.token.sub,
          expires: expiresAt
        });

        return sessionToken;
      }

      return defaultEncode(params);
    },
  },
  session: {
    //expires in 1 day
    maxAge: 1 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },

  secret: process.env.AUTH_SECRET,
  trustHost: true,
  adapter: DrizzleAdapter(db),
  basePath: "/auth"
};

const authSession = async (req, res, next) => {
  try {
    res.locals.session = await getSession(req, authConfig);
    next();
  } catch (error) {
    console.error('Auth session error:', error);
    next(error);
  }
};

const authenticatedUser = async (req, res, next) => {
  const session = res.locals.session ?? (await getSession(req, authConfig));
  if (!session?.user) {
    res.redirect("/login");
  } else {
    next();
  }
};

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.ENDPOINT_SECRET);
  }
  catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    console.error('Webhook error:', err);
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed':
      try {
        const session = event.data.object;

        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          {
            expand: ['data.price.product']
          }
        );

        const [order] = await db
          .insert(orders)
          .values({
            userId: session.metadata.userId,
            stripeSessionId: session.id,
          })
          .returning();

        const orderItemsToInsert = lineItems.data.map(item => ({
          id: item.id,
          orderId: order.id,
          productId: item.price.product.metadata.productId || null,
          name: item.price.product.name,
          description: item.description,
          amountSubtotal: item.amount_subtotal,
          amountTax: item.amount_tax,
          amountTotal: item.amount_total,
          amountDiscount: item.amount_discount,
          currency: item.currency,
          quantity: item.quantity,
          priceId: item.price.id,
          unitAmount: item.price.unit_amount,
          stripeProductId: item.price.product.id,
          stripeProductName: item.price.product.name,
          stripeProductImage: item.price.product.images?.[0] || null,
        }));

        await db
          .insert(orderItems)
          .values(orderItemsToInsert);

        for (const item of lineItems.data) {
          if (item.description === 'Sales Tax') continue;

          const productId = item.price.product.metadata.productId;
          const quantityPurchased = item.quantity;

          const updateResult = await db
            .update(products)
            .set({
              stockCount: sql`stock_count - ${quantityPurchased}`,
              updatedAt: new Date()
            })
            .where(eq(products.id, productId))
            .returning({
              updatedQuantity: products.stockCount,
              productName: products.name
            });
        }
      } catch (error) {
        console.error('Error processing checkout session:', error);
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

app.use(authSession);
app.use("/auth/*", ExpressAuth(authConfig));
app.use(express.static('public'));
app.use(express.json())
app.use(
  "/api/uploadthing",
  createRouteHandler({
    router: uploadRouter,
    config: {
      maxBodySize: "10MB",
      maxFiles: 4,
    },
  }),
);

async function getProductWithDetails(productId) {
  try {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId));

    if (!product) return null;

    const productImagesList = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(productImages.displayOrder);

    const productFeaturesList = await db
      .select()
      .from(productFeatures)
      .where(eq(productFeatures.productId, productId))
      .orderBy(productFeatures.displayOrder);

    const productReviewsList = await db
      .select({
        rating: productReviews.rating,
        title: productReviews.title,
        content: productReviews.content,
        createdAt: productReviews.createdAt,
        userName: users.name
      })
      .from(productReviews)
      .leftJoin(users, eq(users.id, productReviews.userId))
      .where(eq(productReviews.productId, productId))
      .orderBy(productReviews.createdAt);

    const [reviewStats] = await db
      .select({
        averageRating: avg(productReviews.rating),
        reviewCount: count(productReviews.id),
      })
      .from(productReviews)
      .where(eq(productReviews.productId, productId))
      .groupBy(productReviews.productId);

    const formattedReviews = productReviewsList.map(review => ({
      rating: review.rating,
      title: review.title,
      date: new Date(review.createdAt).toDateString(),
      content: review.content,
      userName: review.userName
    }));

    return {
      ...product,
      images: productImagesList,
      features: productFeaturesList,
      reviews: formattedReviews,
      rating: reviewStats?.averageRating ? parseFloat(reviewStats.averageRating).toFixed(1) : 0,
      reviewCount: reviewStats?.reviewCount || 0
    };
  } catch (error) {
    console.error('Error in getProductWithDetails:', error);
    throw error;
  }
}

const testimonials = [
  {
    name: 'John Doe',
    rating: 5,
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
  },
  {
    name: 'Jane Doe',
    rating: 4,
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
  },
  {
    name: 'Alice Doe',
    rating: 5,
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
  }
];

app.get('/', async (req, res) => {
  const { session } = res.locals;

  const bestSellingProducts = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      mainImageUrl: products.mainImageUrl,
      shortDescription: products.shortDescription,
      description: products.description,
      averageRating: avg(productReviews.rating),
      reviewCount: count(productReviews.id),
      isBestSeller: products.isBestSeller
    })
    .from(products)
    .limit(3)
    .where(eq(products.isBestSeller, true))
    .leftJoin(productReviews, eq(products.id, productReviews.productId))
    .groupBy(products.id)

  res.render('pages/index', { title: 'RetroTech Vault', testimonials, bestSellingProducts, user: session?.user });
});

app.get('/login', (req, res) => {
  const { session } = res.locals;

  if (session?.user) {
    res.redirect('/shop', { user: session?.user });
  } else {
    res.render('pages/login', { user: session?.user });
  }
});

app.get('/register', (req, res) => {
  const { session } = res.locals;

  if (session?.user) {
    res.redirect('/shop', { user: session?.user });
  } else {
    res.render('pages/register', { user: session?.user });
  }
});

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.insert(users).values({
      name: name,
      email: email,
      password: hashedPassword
    });

    res.status(200).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'An error occurred while registering the user' });
  }
});

app.post('/api/product/:id', authenticatedUser, async (req, res) => {
  const { id } = req.params;

  try {
    const product = await getProductWithDetails(id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({ product });
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.status(500).json({ message: 'Error fetching product details' });
  }
});

app.get('/forgot-password', (req, res) => {
  const { session } = res.locals;

  res.render('pages/forgot-password', { user: session?.user });
});

app.get('/reset-password', async (req, res) => {
  const { session } = res.locals;

  res.render('pages/reset-password', { user: session?.user });
});

app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.PASSWORD_RESET_SECRET);

    if (!decoded?.email) {
      return res.status(400).json({ message: 'Invalid token' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db
      .update(users)
      .set({
        password: hashedPassword
      })
      .where(eq(users.email, decoded.email));

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  const user = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || user.length === 0) {
    return res.status(404).json({ message: 'User not found' });
  }

  const token = jwt.sign({ email: email }, process.env.PASSWORD_RESET_SECRET, { expiresIn: '1h' });

  const emailBodyHtml = PasswordResetEmailTemplate({ token });

  const formData = new FormData();
  formData.append('from', process.env.MAILEROO_FROM_EMAIL);
  formData.append('to', email);
  formData.append('subject', 'RetroTech Vault Password Reset');
  formData.append('html', emailBodyHtml);

  const response = await fetch('https://smtp.maileroo.com/send', {
    method: 'POST',
    headers: {
      'X-API-Key': process.env.MAILEROO_API_KEY,
    },
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.log('Error sending password reset email:', errorData);
    return res.status(500).json({ message: 'Error sending password reset email' });
  }

  return res.status(200).json({ message: 'Password reset email sent' });
});

app.get('/api/search', async (req, res) => {
  const { query } = req.query;

  try {
    const productsWithStats = await db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        mainImageUrl: products.mainImageUrl,
        shortDescription: products.shortDescription,
        description: products.description,
        averageRating: avg(productReviews.rating),
        reviewCount: count(productReviews.id),
        isBestSeller: products.isBestSeller,
        stockCount: products.stockCount,
        condition: products.condition,
        consoleType: products.consoleType
      })
      .from(products)
      .where(sql`LOWER(${products.name}) LIKE LOWER(${`%${query}%`})`)
      .leftJoin(productReviews, eq(products.id, productReviews.productId))
      .groupBy(products.id)
      .having(sql`true`);

    const formattedProducts = productsWithStats.map(product => ({
      id: product.id,
      name: product.name,
      price: parseFloat(product.price),
      image: product.mainImageUrl,
      description: product.shortDescription || product.description,
      rating: product.averageRating ? parseFloat(product.averageRating).toFixed(1) : 0,
      number_of_ratings: product.reviewCount || 0,
      isBestSeller: product.isBestSeller,
      stockCount: product.stockCount,
      condition: product.condition,
      consoleType: product.consoleType
    }));

    res.status(200).json({ products: formattedProducts });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Error fetching products' });
  }
});

app.post('/api/quote-email', async (req, res) => {
  const { email } = req.body;

  const emailBodyHtml = AdminQuestionEmail({ email });

  const formData = new FormData();
  formData.append('from', process.env.MAILEROO_FROM_EMAIL);
  formData.append('to', process.env.ADMIN_EMAIL);
  formData.append('subject', 'RetroTech Vault Quote Request');
  formData.append('html', emailBodyHtml);

  const response = await fetch('https://smtp.maileroo.com/send', {
    method: 'POST',
    headers: {
      'X-API-Key': process.env.MAILEROO_API_KEY,
    },
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.log('Error sending question email:', errorData);
    return res.status(500).json({ message: 'Error sending question email' });
  }

  return res.status(200).json({ message: 'Question email sent' });
});

// Protected routes
app.get('/shop', authenticatedUser, async (req, res) => {
  const { session } = res.locals;
  const { consoleType, condition, sort, query } = req.query;

  try {
    const productsWithStats = await db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        mainImageUrl: products.mainImageUrl,
        shortDescription: products.shortDescription,
        description: products.description,
        averageRating: avg(productReviews.rating),
        reviewCount: count(productReviews.id),
        isBestSeller: products.isBestSeller,
        stockCount: products.stockCount,
        condition: products.condition,
        consoleType: products.consoleType
      })
      .from(products)
      .where(
        and(
          consoleType ? eq(products.consoleType, consoleType) : undefined,
          condition ? eq(products.condition, condition) : undefined,
          query ? sql`LOWER(${products.name}) LIKE LOWER(${`%${query}%`})` : undefined
        )
      )
      .orderBy((() => {
        switch (sort) {
          case 'price-asc':
            return asc(products.price);
          case 'price-desc':
            return desc(products.price);
          case 'newest':
            return desc(products.createdAt);
          case 'best-selling':
            return desc(products.isBestSeller);
          default:
            return desc(products.isBestSeller);
        }
      })())
      .leftJoin(productReviews, eq(products.id, productReviews.productId))
      .groupBy(products.id)
      .having(sql`true`);

    const formattedProducts = productsWithStats.map(product => ({
      id: product.id,
      name: product.name,
      price: parseFloat(product.price),
      image: product.mainImageUrl,
      description: product.shortDescription || product.description,
      rating: product.averageRating ? parseFloat(product.averageRating).toFixed(1) : 0,
      number_of_ratings: product.reviewCount || 0,
      isBestSeller: product.isBestSeller,
      stockCount: product.stockCount,
      condition: product.condition,
      consoleType: product.consoleType
    }));

    res.render('pages/shop', { products: formattedProducts, user: session?.user });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).render('pages/not_found', {
      message: 'Error fetching products',
      user: session?.user
    });
  }
});

app.get('/profile', authenticatedUser, async (req, res) => {
  const { session } = res.locals;

  const userOrders = await db
    .select({
      id: orders.id,
      stripeSessionId: orders.stripeSessionId
    })
    .from(orders)
    .where(eq(orders.userId, session?.user.id));

  let totalOrders = 0;
  let totalAmountSpent = 0;

  for (const order of userOrders) {
    try {
      const stripeSession = await stripe.checkout.sessions.retrieve(order.stripeSessionId, {
        expand: ['payment_intent.payment_method']
      });

      totalOrders++;
      totalAmountSpent += stripeSession.amount_total || 0;
    } catch (error) {
      console.error(`Error retrieving Stripe session for order ${order.id}:`, error);
    }
  }

  res.render('pages/profile', { user: session?.user, totalOrders, totalAmountSpent: (totalAmountSpent / 100).toFixed(2) });
});

app.post('/api/update-profile', authenticatedUser, async (req, res) => {
  const { session } = res.locals;
  const { name, email } = req.body;

  try {
    await db
      .update(users)
      .set({
        name,
        email
      })
      .where(eq(users.id, session?.user.id));

    res.status(200).json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

app.post('/api/add-review', authenticatedUser, async (req, res) => {
  const { session } = res.locals;
  const { productId, rating, title, content } = req.body;

  try {
    await db.insert(productReviews).values({
      userId: session?.user.id,
      productId,
      rating,
      title,
      content
    });

    res.status(200).json({ message: 'Review added successfully' });
  } catch (error) {
    console.error('Error adding review:', error);
    res.status(500).json({ message: 'Error adding review' });
  }
});

app.get('/success', authenticatedUser, async (req, res) => {
  const { session } = res.locals;

  if (!req.query.session_id) {
    return res.status(400).render('pages/not_found', {
      message: 'Invalid session ID',
      user: session?.user
    });
  }

  try {
    await stripe.checkout.sessions.retrieve(req.query.session_id)
  } catch (error) {
    res.status(404).render('pages/not_found', {
      message: 'Error fetching stripe session',
      user: session?.user
    });
    return;
  }

  const result = await Promise.all([
    stripe.checkout.sessions.retrieve(req.query.session_id, { expand: ['payment_intent.payment_method'] }),
    stripe.checkout.sessions.listLineItems(req.query.session_id)
  ])

  res.render('pages/success', { user: session?.user, result });
});

app.get('/orders', authenticatedUser, async (req, res) => {
  const { session } = res.locals;

  try {
    const userOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, session?.user?.id))
      .orderBy(desc(orders.createdAt));

    const orderItemsResult = await db
      .select()
      .from(orderItems)
      .where(inArray(
        orderItems.orderId,
        userOrders.map(order => order.id)
      ));

    const ordersWithItems = await Promise.all(userOrders.map(async (order) => {
      const items = orderItemsResult.filter(item => item.orderId === order.id && item.productId !== null);
      const stripeSession = await stripe.checkout.sessions.retrieve(order.stripeSessionId, {
        expand: ['payment_intent.payment_method']
      });
      const total = stripeSession.amount_total;

      return {
        id: order.id,
        stripeSessionId: order.stripeSessionId,
        createdAt: order.createdAt,
        total,
        items: items.map(item => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          name: item.name,
          amountTotal: item.amountTotal,
          currency: item.currency,
          image: item.stripeProductImage
        }))
      };
    }));

    res.render('pages/orders', {
      user: session?.user,
      orders: ordersWithItems
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).render('pages/not_found', {
      message: 'Error fetching orders',
      user: session?.user
    });
  }
});

app.get('/order/:id', authenticatedUser, async (req, res) => {
  const { session } = res.locals;
  const { id } = req.params;

  const order = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, session.user.id)))

  const stripeResult = await Promise.all([
    stripe.checkout.sessions.retrieve(order[0].stripeSessionId, { expand: ['payment_intent.payment_method'] }),
    stripe.checkout.sessions.listLineItems(order[0].stripeSessionId)
  ])

  const orderItemsResult = await db
    .select()
    .from(orderItems)
    .where(
      eq(orderItems.orderId, id)
    );

  res.render('pages/order', { user: session?.user, stripeResult, orderItemsResult });
})

app.post('/api/checkout', authenticatedUser, async (req, res) => {
  const { session } = res.locals;
  const { cart, shipping, tax } = req.body;

  let OutOfStock = false;

  cart.forEach(item => {
    if (item.product.stockCount <= 0) {
      res.status(400).json({ message: `"${item.product.name}" is no longer in stock.\nPlease remove it from your cart.` });
      OutOfStock = true;
    }
  });

  if (OutOfStock) return;

  try {
    const lineItems = cart.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.product.name,
          images: [item.product.mainImageUrl],
          metadata: {
            productId: item.product.id,
          }
        },
        unit_amount: Math.ceil(parseFloat(item.product.price).toFixed(2) * 100),
      },
      quantity: item.quantity
    }));

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Sales Tax',
        },
        unit_amount: Math.ceil(parseFloat(tax).toFixed(2) * 100),
      },
      quantity: 1
    });

    const stripeSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      metadata: {
        userId: session?.user?.id
      },
      shipping_address_collection: {
        allowed_countries: ['US']
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: shipping * 100,
              currency: 'usd',
            },
            display_name: 'Free shipping',
            delivery_estimate: {
              minimum: {
                unit: 'business_day',
                value: 5,
              },
              maximum: {
                unit: 'business_day',
                value: 7,
              },
            },
          },
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: (shipping * 4) * 100,
              currency: 'usd',
            },
            display_name: 'Next day air',
            delivery_estimate: {
              minimum: {
                unit: 'business_day',
                value: 1,
              },
              maximum: {
                unit: 'business_day',
                value: 1,
              },
            },
          },
        },
      ],
      customer_email: session?.user?.email,
      billing_address_collection: 'required',
      success_url: 'http://localhost:8080/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'http://localhost:8080/cart'
    });

    res.status(200).json({ sessionId: stripeSession.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ message: 'Error creating checkout session' });
  }
});

app.get('/product/:id', authenticatedUser, async (req, res) => {
  const { session } = res.locals;
  const { id } = req.params;

  try {
    const product = await getProductWithDetails(id);

    if (!product) {
      return res.status(404).render('pages/not_found', { user: session?.user });
    }

    res.render('pages/product', { product, user: session?.user });
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.status(500).render('pages/not_found', {
      message: 'Error fetching product details',
      user: session?.user
    });
  }
});

app.get('/logout', authenticatedUser, async (req, res) => {
  await signOut(req, res, authConfig);

  res.redirect('/');
});

app.get('/cart', authenticatedUser, async (req, res) => {
  const { session } = res.locals;

  res.render('pages/cart', { user: session?.user, stripePublicKey: process.env.STRIPE_PUBLIC });
});

app.get('*', (req, res) => {
  const { session } = res.locals;

  res.render('pages/not_found', { user: session?.user });
});

app.listen(port, () => {
  console.log(`Server is listening on port http://localhost:${port}`);
});