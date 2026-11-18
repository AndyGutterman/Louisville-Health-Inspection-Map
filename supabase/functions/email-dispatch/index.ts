// email-dispatch: starts the "Email outbox" GitHub workflow the moment the email admin
// page queues an email (docs/EMAIL_ADMIN.md), so a test lands in a minute or two instead
// of waiting for someone to start the workflow by hand.
//
// It sends nothing itself and never sees an email's content: the job is already in
// email_jobs, and the workflow reads it from there with the service-role key. Who may
// call it and the secrets it needs: ../_shared/dispatch.ts.
import { dispatchHandler } from "../_shared/dispatch.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(
  dispatchHandler({
    workflow: "email-outbox.yml",
    userAgent: "lfs-email-dispatch",
    // The job's id only labels the run; the workflow sends everything that is queued.
    inputs: (body) => ({
      job: typeof body?.job === "string" && UUID.test(body.job) ? body.job : "",
    }),
  }),
);
