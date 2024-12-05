![RetroTech Vault!](https://cdn.discordapp.com/attachments/1256135134042919006/1314319751455047820/image.png?ex=67535727&is=675205a7&hm=c8cd4c4ab9ec8db645a9bd2b5d12b45254595c54ef5edb95a8a0801cd9cbac8d&, "RetroTech Vault")

# RetroTech Vault
This is a mock e-commerce website created for the CYBI 6314 course. The project simulates an online store for restoring and selling retro gaming consoles.

## Project Status
- Under Development - may revisit in the future.

## Technologies Used
- HTML
- Tailwind CSS
- EJS Templating
- Lucide Icons
- Auth.js
- Drizzle ORM
- express.js
- stripe
- uploadthing

## Purpose
This project was developed as a learning exercise to practice web development techniques, including:

- Responsive design
- Frontend templating
- Basic e-commerce layout

Note: This is a fictional website created solely for educational purposes and is not a real business.

## Installation

### Requirements
You need to have npm and nodejs installed **nodejs version must be greater than 20.x**.

Use the package manager [pip](https://pip.pypa.io/en/stable/) to install all needed dependencies.

```bash
pip install
```

Next, make sure to configure all the environment variables rename the .env.example file to just .env, and fill in all the variables.

```bash
mv .env.example .env
```

What the env.example file contains.

```bash
AUTH_SECRET="" # Added by `npx auth`. Read more: https://cli.authjs.dev

# Discord ID and Secret can be obtained by creating a new application at https://discord.com/developers/applications
DISCORD_ID=""
DISCORD_SECRET=""

# postgress connection string, get a free database instance at https://supabase.com
AUTH_DRIZZLE_URL=""

# uploadthing token can be obtained by creating a new application at https://uploadthing.com
UPLOADTHING_TOKEN=""

# stripe secret and public keys can be obtained by creating a new application at https://stripe.com
STRIPE_SECRET=""
STRIPE_PUBLIC=""
# stripe webhook secret can be obtained by creating a new webhook at https://stripe.com
ENDPOINT_SECRET=""

# maileroo api key can be obtained by creating a new application at https://maileroo.com
# the email sender does not mater as long as the domain is the one provided by maileroo
MAILEROO_FROM_EMAIL="admin@"
MAILEROO_API_KEY=""

# the password searct is used to sign the password reset token
PASSWORD_RESET_SECRET=""
# domain is the domain of the website
DOMAIN="http://localhost:8080"
# admin email is the email of the admin this is were question emails will be sent make sure to verify the email in maileroo
ADMIN_EMAIL=""
```

Next, we need to push our schema to our Postgres database.

```bash
npx drizzle-kit push --dialect=postgresql --schema=./schema.js --url=postgresql://[database_connection_url]
```

Finally, we need to install [stripe CLI and create a webhook](https://docs.stripe.com/webhooks).

## Usage

First, we must start our express.js server.

```bash
node --env-file=.env ./server.js
```

Next, we must start listing on our local stripe webhook.

```bash
stripe listen --forward-to [change_this_to_your_domain]/webhook
```

**If you are running this locally the domain is localhost:8080**

## Support
For any questions or issues please email <ramon@ramongarciajr.tech>.

## License

[MIT](https://choosealicense.com/licenses/mit/)