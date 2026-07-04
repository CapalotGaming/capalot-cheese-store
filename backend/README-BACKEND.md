# Capalot Cheese Backend

This backend receives Square webhook events and writes paid orders into Supabase.

## Important

Your existing Square Payment Links will redirect customers to Square, but Payment Links do not reliably carry your website user ID. This backend tries to match orders to users by buyer email using the `profiles.email` value. For perfect automatic order matching later, switch from static Payment Links to Square Checkout API with a reference ID/user ID.

## Setup

1. Open a terminal:

```bash
cd backend
npm install
```

2. Copy `.env.example` to `.env` and fill in:

```bash
SUPABASE_SERVICE_ROLE_KEY=your service role key
SQUARE_WEBHOOK_SIGNATURE_KEY=your Square webhook signature key
SQUARE_WEBHOOK_URL=https://your-live-backend-domain.com/webhooks/square
```

Never put the service role key in browser JavaScript.

3. Run locally:

```bash
npm run dev
```

4. Run the extra SQL in Supabase:

```sql
backend/SUPABASE-BACKEND-SQL.sql
```

## Testing account order history without Square

Once the backend is running and your user has logged in once, you can create a test order:

```bash
curl -X POST http://localhost:3000/admin/test-order \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","game":"Arc Raiders","plan":"30 Day Pass","total":70.99}'
```

Refresh `account.html` and the order should appear.

## Square Webhook

Square cannot call `localhost` directly. Use a deployed backend URL or a tunnel such as ngrok while testing.

Webhook endpoint:

```text
POST /webhooks/square
```
