// Remplis ces 2 valeurs après avoir créé le projet Supabase (gratuit).
// Voir les étapes dans le message / en bas de ce fichier.
window.DHAUTO_CONFIG = {
  supabaseUrl: "", // ex: https://xxxxx.supabase.co
  supabaseKey: "", // clé "anon" / "public"
};

/*
ÉTAPES RAPIDES (une seule fois) :
1. Va sur https://supabase.com et crée un compte gratuit
2. New project → nom "dhauto" → choisis un mot de passe → Create
3. SQL Editor → New query → colle et Run :

create table if not exists invoices (
  id text primary key,
  number text not null,
  created_at bigint not null,
  invoice_date text,
  data jsonb not null
);
alter table invoices enable row level security;
create policy "allow_all_invoices" on invoices
  for all to anon using (true) with check (true);
grant all on table invoices to anon;

4. Project Settings → API → copie Project URL et anon public key
5. Colle-les ci-dessus, sauvegarde, et dis-moi de republier le site
*/
