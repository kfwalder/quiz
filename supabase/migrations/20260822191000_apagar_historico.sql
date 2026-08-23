create policy "delete own attempts" on public.simulados
for delete using (user_id = auth.uid());
