# AI usage

**Tools:** Lovable's AI agent (a Claude-based coding assistant). It wrote the code, the sample data and these docs.

**How it was directed:**
- The brief was read first and turned into explicit rules before any code was written (see DECISIONS.md).
- The business rules live in one file of pure functions (`src/lib/quiz.service.ts`) that take "now" as an input. That makes the rules easy to test without real clocks or browsers.
- The sample data comes from a script that writes CSV files, so the app loads data exactly the way it will load the real spreadsheets.

**How the output was checked:**
- 18 automated tests (`npm test`) cover the rules that matter most: scoring, one attempt per student, deadlines, access checks and hiding answers.
- A strict TypeScript typecheck passes.
- Every server call re-checks the user's role and ownership. The page-level redirects only improve the experience and are not relied on for security.

**Limits:** the phone layout was checked mainly by reading the layout code, with only a brief look in a browser. A human should still click through on a real phone.
