# Security Specification & Test Definitions

## 1. Data Invariants
- Admin document `/admins/{adminId}` can only be read or written by authorized administrators.
- User profile `/users/{userId}`: PII (`phone`, `email`) can only be read by the owner user (`request.auth.uid == userId`) or an admin. Users can only update their own profile and cannot elevate privileges.
- Courts `/courts/{courtId}`: Anyone authenticated can read courts; only admins can create, update, or delete courts.
- Matches `/matches/{matchId}`: Authenticated users can read matches to see availability. Only the match host or an admin can update or cancel a match.
- Transactions `/transactions/{transactionId}`: Financial records are strictly sensitive and can only be read or written by admins.
- Support Tickets `/support_tickets/{ticketId}`: Any authenticated user can create a support ticket. Only the creator or an admin can read or update their ticket.
- Default deny: All unspecified paths are closed.

## 2. The Dirty Dozen Payloads (Targeting Hardened Security Invariants)
1. **Unauthenticated Read on Transactions**: An anonymous request attempts to read `/transactions/t1`. -> `PERMISSION_DENIED`
2. **Unauthenticated Create on Match**: An anonymous request attempts to create a match. -> `PERMISSION_DENIED`
3. **Ghost Field Injection on User**: User updates `/users/{uid}` injecting `isAdmin: true`. -> `PERMISSION_DENIED`
4. **ID Spoofing on Match**: User A attempts to create a match with `host_id: "userB"`. -> `PERMISSION_DENIED`
5. **Path ID Poisoning**: Request with document ID of 500 characters containing illegal symbols. -> `PERMISSION_DENIED`
6. **Denial of Wallet String Injection**: Request with a 500KB text payload into `title` or `name`. -> `PERMISSION_DENIED`
7. **Cross-Tenant PII Read**: User A attempts to directly read `/users/{userB}` contact info. -> `PERMISSION_DENIED`
8. **Unauthorized Transaction Write**: Non-admin user attempts to create an income transaction. -> `PERMISSION_DENIED`
9. **Tampering with Court Pricing**: Non-admin user attempts to modify court hourly rate. -> `PERMISSION_DENIED`
10. **State Shortcutting on Match**: Non-host user attempts to set match status to completed. -> `PERMISSION_DENIED`
11. **Immutable Field Tampering**: Host attempts to change `createdAt` or `host_id` of an existing match. -> `PERMISSION_DENIED`
12. **Blanket Query Scraping**: Non-admin attempts to query all transactions with no filter. -> `PERMISSION_DENIED`
