import {
    boolean,
    timestamp,
    pgTable,
    text,
    primaryKey,
    integer,
    decimal,
    uniqueIndex
} from "drizzle-orm/pg-core"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"

const pool = postgres(process.env.AUTH_DRIZZLE_URL, { max: 1 })

export const db = drizzle(pool)

export const users = pgTable("user", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").unique(),
    password: text("password"),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
})

export const accounts = pgTable(
    "account",
    {
        userId: text("userId")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        type: text("type").notNull(),
        provider: text("provider").notNull(),
        providerAccountId: text("providerAccountId").notNull(),
        refresh_token: text("refresh_token"),
        access_token: text("access_token"),
        expires_at: integer("expires_at"),
        token_type: text("token_type"),
        scope: text("scope"),
        id_token: text("id_token"),
        session_state: text("session_state"),
    },
    (account) => ({
        compoundKey: primaryKey({
            columns: [account.provider, account.providerAccountId],
        }),
    })
)

export const sessions = pgTable("session", {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
    "verificationToken",
    {
        identifier: text("identifier").notNull(),
        token: text("token").notNull(),
        expires: timestamp("expires", { mode: "date" }).notNull(),
    },
    (verificationToken) => ({
        compositePk: primaryKey({
            columns: [verificationToken.identifier, verificationToken.token],
        }),
    })
)

export const authenticators = pgTable(
    "authenticator",
    {
        credentialID: text("credential_id").notNull().unique(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        providerAccountId: text("provider_account_id").notNull(),
        credentialPublicKey: text("credential_public_key").notNull(),
        counter: integer("counter").notNull(),
        credentialDeviceType: text("credential_device_type").notNull(),
        credentialBackedUp: boolean("credential_backed_up").notNull(),
        transports: text("transports"),
    },
    (authenticator) => ({
        compositePK: primaryKey({
            columns: [authenticator.userId, authenticator.credentialID],
        }),
    })
)

export const orders = pgTable("order", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    stripeSessionId: text("stripe_session_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" })
        .notNull()
        .defaultNow(),
})

export const orderItems = pgTable("order_item", {
    id: text("id")
        .primaryKey(),
    orderId: text("order_id")
        .notNull()
        .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
        .references(() => products.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    amountSubtotal: integer("amount_subtotal").notNull(),
    amountTax: integer("amount_tax").notNull(),
    amountTotal: integer("amount_total").notNull(),
    amountDiscount: integer("amount_discount").notNull(),
    currency: text("currency").notNull(),
    quantity: integer("quantity").notNull(),

    priceId: text("price_id").notNull(),
    unitAmount: integer("unit_amount").notNull(),

    stripeProductId: text("stripe_product_id"),
    stripeProductName: text("stripe_product_name"),
    stripeProductImage: text("stripe_product_image"),

    createdAt: timestamp("created_at", { mode: "date" })
        .notNull()
        .defaultNow(),
})

export const products = pgTable("product", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    consoleType: text("console_type").notNull(),
    condition: text("condition").notNull(),
    conditionDescription: text("condition_description"),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    stockCount: integer("stock_count").notNull().default(0),
    mainImageUrl: text("main_image_url"),
    createdAt: timestamp("created_at", { mode: "date" })
        .notNull()
        .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
        .notNull()
        .defaultNow(),
    isBestSeller: boolean("is_best_seller").notNull().default(false),
})

export const productImages = pgTable("product_image", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    productId: text("product_id")
        .notNull()
        .references(() => products.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" })
        .notNull()
        .defaultNow(),
})

export const productFeatures = pgTable("product_feature", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    productId: text("product_id")
        .notNull()
        .references(() => products.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" })
        .notNull()
        .defaultNow(),
})

export const productReviews = pgTable("product_review", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    productId: text("product_id")
        .notNull()
        .references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" })
        .notNull()
        .defaultNow(),
})

export const cartItems = pgTable("cart_item", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
        .notNull()
        .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date" })
        .notNull()
        .defaultNow(),
}, (table) => ({
    uniqueUserProduct: uniqueIndex('unique_user_product')
        .on(table.userId, table.productId)
}))

export const wishlistItems = pgTable("wishlist_item", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
        .notNull()
        .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" })
        .notNull()
        .defaultNow(),
}, (table) => ({
    uniqueUserProduct: uniqueIndex('unique_user_wishlist_product')
        .on(table.userId, table.productId)
}))