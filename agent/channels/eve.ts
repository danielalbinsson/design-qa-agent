import { eveChannel } from "eve/channels/eve";
import { httpBasic, localDev } from "eve/channels/auth";

// Route auth — guards POST /eve/v1/session, POST /eve/v1/session/:id, and the
// stream route. eve FAILS CLOSED: without a channel that accepts traffic, a
// deployed agent rejects every request. /eve/v1/health stays public.
//
// Walk (verified signatures against installed eve 0.16.2):
//   - httpBasic({ username, password }): operator access you fully control.
//     Drive the deployment with `curl -u <username>:<password> ...`. This
//     avoids the vercelOidc() project/env token-matching that was rejecting
//     `eve dev <url>`. Only registered when ROUTE_AUTH_BASIC_PASSWORD is set —
//     an empty password must not accept `user:` with a blank pass.
//   - localDev(): still accepts loopback so local `pnpm run dev` needs no creds.
//
// Set ROUTE_AUTH_BASIC_PASSWORD (and optionally ROUTE_AUTH_BASIC_USER) as
// Vercel env vars (and in local .env).
const basicPassword = process.env.ROUTE_AUTH_BASIC_PASSWORD?.trim() ?? "";
const basicUser = process.env.ROUTE_AUTH_BASIC_USER?.trim() || "daniel";

export default eveChannel({
  auth: [
    ...(basicPassword
      ? [
          httpBasic({
            username: basicUser,
            password: basicPassword,
          }),
        ]
      : []),
    localDev(),
  ],
});
