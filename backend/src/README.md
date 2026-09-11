# Backend source layout

The backend is grouped by responsibility so that new code has one predictable home.

- `core/`: configuration, database connection, and shared errors. It must not import feature modules.
- `exam/`: public exam/session domain logic and persistence.
- `email/`: Brevo transport, billing-cycle policy, usage accounting, and quota warnings.
- `listening/`: TTS provider integration, narration construction, audio composition, and its worker.
- `media/`: Supabase storage, image generation helpers, and durable asset cleanup.
- `admin/`: admin authentication, repository facade, exports, repositories, and admin-only workers.
- `routes/`: Fastify HTTP adapters. Admin adapters live under `routes/admin/`.
- Root files: application composition and executable maintenance entry points only.

Allowed dependency direction:

```text
email     -> core
media     -> core
listening -> core, media
exam      -> core, email, media
admin     -> core, email, listening, media
routes    -> admin, exam, email, listening, media
app/server -> routes and feature entry points
```

Feature modules may use `core`, but `core` must stay feature-independent. HTTP validation and response
formatting belong in `routes`; SQL and transactions belong in repositories; provider calls and retry loops
belong in their feature modules. Keep `app.ts` as the composition root rather than adding business logic there.
