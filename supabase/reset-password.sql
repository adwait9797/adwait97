-- Reset a friend's password (no email needed).
-- Supabase dashboard -> SQL Editor -> New query -> paste, edit the two values, Run.
-- Then send them the temporary password; they log in and change it under Profile -> Change password.

update auth.users
set encrypted_password = extensions.crypt('TEMP-PASSWORD-HERE', extensions.gen_salt('bf')),
    updated_at = now()
where email = lower('friend@example.com');

-- Should say "UPDATE 1". "UPDATE 0" means no account uses that email.
