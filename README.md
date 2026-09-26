# Thursday Quizzes

A mobile-first timed quiz website for a tutoring centre, with full Arabic (right-to-left) support. Built with TanStack Start (React 19, Vite, Tailwind v4).

## Run it (one command)

Requires Node 20+ (or Bun).

```sh
npm install && npm run dev
```

Then open http://localhost:8080. You don't need a database server or any secrets. Data lives in `data/db.json`. The app creates that file from the spreadsheets in `seed/` the first time it runs.

## Sample data

- `seed/students.csv`: 60 students (20 each in 10A, 10B, 11A), with Arabic and English names.
- `seed/teachers.csv`: 4 teachers plus Nour (admin).
- `seed/quizzes.csv` and `seed/questions.csv`: 5 quizzes of 15 questions each, one of them in Arabic, with mixed negative-marking rules. Two quizzes are already closed and have results so the dashboards have something to show.

To reload the sample data, delete `data/db.json` and restart the app, or sign in as Nour and click **Reset demo data**. To load the real spreadsheets, export them as UTF-8 CSV with the same column headers and replace the files in `seed/`. Times in the sheets are Amman local time.

## Logins

| Role | Username | Password |
|---|---|---|
| Student (10A) | `s10a01` … `s10a20` | `pass1234` |
| Student (10B / 11A) | `s10b01`, `s11a01`, … | `pass1234` |
| Teacher | `t.khaled`, `t.rania`, `t.samer`, `t.hala` | `teacher123` |
| Admin (Nour) | `nour` | `admin123` |

The sign-in page also has one-tap buttons for these demo accounts.

## Tests

```sh
npm test
```

The tests cover scoring (negative marking and the zero floor), the one-attempt rule, resuming after a refresh, late submissions and abandoned attempts, class and ownership access checks, hiding answers until the quiz closes, locking a quiz once students have taken it, CSV parsing and the seed data counts.
