# Decisions

## Assumptions
- **Negative marking** is a fraction of each question's points (0, 25%, 50% or 100%), set per quiz by the teacher. Unanswered questions score 0. A quiz total can't go below 0.
- **Time limit**: the attempt deadline is start time plus duration, but never later than the quiz's closing time. The server clock decides. The phone timer adjusts for a phone clock that is off.
- **Refreshing or closing the page** doesn't reset the timer. The student picks up the same attempt. Each answer is saved as it's tapped. If a student leaves without submitting, the saved answers are graded automatically once the deadline passes.
- **Late submissions**: a 30-second grace period covers slow networks. After that, only answers saved before the deadline count.
- **Answer review**: students see their score straight away, but the correct answers only appear after the quiz closes. This stops early finishers from passing answers to classmates.
- **Editing a quiz after students have taken it**: only the title and dates can change. Changing questions, marking, class or duration would make scores unfair.
- Teachers only see their own quizzes. Nour (admin) sees everything.
- All times are Amman time (UTC+3).

## Built without being asked
- A one-tap Arabic/English switch that flips the whole layout to right-to-left. Quiz text sets its own direction automatically, so Arabic and English can mix on one page.
- Demo-login buttons and a "Reset demo data" button so Nour can click through easily.
- A per-question breakdown showing how many students chose each option, which helps spot bad questions.

## Deliberately left out
- A real database and account management. Data is a JSON file, which is fine for a demo. Hosted serverless platforms keep it in memory only.
- Uploading spreadsheets in the app. For now, you replace the CSV files instead.
- Shuffling questions and options, password resets, per-student time extensions, and exporting results to CSV.
- Strong password hashing. Passwords use salted SHA-256, which is only suitable for a demo.

## Next week
Move to Postgres/SQLite with migrations and proper password hashing (argon2). Add CSV upload with a preview and error report, question shuffling, results export, extra time for individual students, and Playwright tests for the phone flow.
