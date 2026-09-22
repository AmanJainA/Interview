# Interview Portal (React + Supabase)

A user/admin assessment portal:

- Users register, log in, see an About-the-company / Instructions dashboard, then take an
  MCQ assessment one question at a time. Every answer is saved to the database the instant
  it's picked, so a browser crash never loses progress. A countdown timer auto-submits when
  time runs out. Once submitted, a user can never re-enter the assessment.
- Admins log in to a dashboard with total users / attempted users / today's registrations,
  a clickable score-distribution chart (0–69%, 70%, 80%, 90%, 100%), a recent-completions
  list, and a full results table with a per-user answer breakdown.

## 1. Set up Supabase

1. Create a project at supabase.com.
2. Open the SQL editor and run `supabase/schema.sql` from this folder. It creates the
   `interview` schema with `users`, `company_info`, `questions`, `assessment_attempts`,
   `user_answers`, and all the row-level-security policies.
3. In **Authentication → Settings**, turn off "Confirm email" while you're testing, or
   registered users will need to click an email link before their profile row is created.
4. Add at least one admin: register normally through the app, then in the SQL editor run:
   ```sql
   update interview.users set usertype = 'admin' where email = 'you@company.com';
   ```
5. Add some questions:
   ```sql
   insert into interview.questions
     (assessment_type, question_text, option_a, option_b, option_c, option_d, correct_option, marks, sort_order)
   values
     ('general', 'What is 2 + 2?', '3', '4', '5', '6', 'B', 1, 1);
   ```
6. Edit the About / Instructions text shown to users:
   ```sql
   update interview.company_info set about = '...', instructions = '...' where id = 1;
   ```

## 2. Configure the app

```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
# Supabase → Project Settings → API
```

## 3. Run it

```bash
npm install
npm run dev
```

## Notes / things you'll likely want to change

- **Assessment type & duration**: set in `src/pages/user/Assessment.jsx`
  (`ASSESSMENT_TYPE`, `DURATION_MINUTES`). Add more assessment types by inserting questions
  with a different `assessment_type` and pointing a second route/page at it.
- **Passwords**: real passwords are handled by Supabase Auth (hashed, never touched by this
  app's code) rather than stored in the `users` table — much safer than a plain password
  column, and it still gives you every other field you asked for (name, email, stream,
  location, usertype, created_date).
- **Making someone admin**: there's no UI for this on purpose (self-service admin signup is
  a security hole) — promote via the SQL editor as shown above, or build an internal-only
  admin-management screen later.
