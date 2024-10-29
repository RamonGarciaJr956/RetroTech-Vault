import express from 'express';
import { ExpressAuth } from '@auth/express';
import { getSession } from '@auth/express';
import Discord from '@auth/express/providers/discord';
import Credentials from '@auth/express/providers/credentials';
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./schema.js";
import bcrypt from 'bcrypt';
import { users, sessions, products, productReviews, productImages, productFeatures } from './schema.js';
import { eq, sql, avg, count } from 'drizzle-orm';
import { v4 as uuid } from "uuid";
import cors from 'cors';
import { createRouteHandler } from "uploadthing/express";
import { uploadRouter } from "./uploadthing.js";

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
      date: formatRelativeTime(review.createdAt),
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

function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
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
    res.redirect('/shop/25', { user: session?.user });
  } else {
    res.render('pages/login', { user: session?.user });
  }
});

app.get('/register', (req, res) => {
  const { session } = res.locals;

  if (session?.user) {
    res.redirect('/shop/25', { user: session?.user });
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

// Protected routes
app.get('/shop/:amount', authenticatedUser, async (req, res) => {
  const { session } = res.locals;

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
        isBestSeller: products.isBestSeller
      })
      .from(products)
      .limit(parseInt(req.params.amount))
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
      isBestSeller: product.isBestSeller
    }));

    res.render('pages/shop', { products: formattedProducts, user: session?.user });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).render('pages/error', {
      message: 'Error fetching products',
      user: session?.user
    });
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
    res.status(500).render('pages/error', {
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

  res.render('pages/cart', { user: session?.user });
});

app.get('*', (req, res) => {
  const { session } = res.locals;

  res.render('pages/not_found', { user: session?.user });
});

app.listen(port, () => {
  console.log(`Server is listening on port http://localhost:${port}`);
});