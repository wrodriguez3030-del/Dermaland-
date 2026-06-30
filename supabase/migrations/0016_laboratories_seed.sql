-- 0016: siembra NO destructiva de laboratorios (dermocosmética internacional,
-- farmacéuticas y laboratorios dominicanos).
--
-- Inserta cada laboratorio para CADA negocio existente SOLO si no existe ya
-- (dedup por nombre en minúsculas, así "ISDIN"/"isdin" no se duplican).
-- Idempotente: re-ejecutar no crea duplicados. No borra, no resetea, no trunca.
--
-- Nota: la tabla `laboratories` solo tiene name/country (+ business_id); el
-- "tipo" del laboratorio se deriva en la UI a partir del nombre, así que aquí
-- solo se siembran nombre y país (sin cambios de esquema).

insert into laboratories (business_id, name, country)
select b.id, v.name, v.country
from businesses b
cross join (values
  ('ISDIN', 'España'),
  ('La Roche-Posay', 'Francia'),
  ('Vichy', 'Francia'),
  ('Eucerin', 'Alemania'),
  ('Avène', 'Francia'),
  ('Bioderma', 'Francia'),
  ('CeraVe', 'Estados Unidos'),
  ('Uriage', 'Francia'),
  ('Sesderma', 'España'),
  ('Heliocare', 'España'),
  ('A-Derma', 'Francia'),
  ('Ducray', 'Francia'),
  ('SVR', 'Francia'),
  ('Filorga', 'Francia'),
  ('MartiDerm', 'España'),
  ('Cantabria Labs', 'España'),
  ('Neostrata', 'Estados Unidos'),
  ('SkinCeuticals', 'Estados Unidos'),
  ('Endocare', 'España'),
  ('Frezyderm', 'Grecia'),
  ('Mustela', 'Francia'),
  ('Cetaphil', 'Suiza'),
  ('Galderma', 'Suiza'),
  ('L''Oréal Dermatological Beauty', 'Francia'),
  ('Pierre Fabre', 'Francia'),
  ('Johnson & Johnson', 'Estados Unidos'),
  ('Bayer', 'Alemania'),
  ('Pfizer', 'Estados Unidos'),
  ('Sanofi', 'Francia'),
  ('Novartis', 'Suiza'),
  ('Roche', 'Suiza'),
  ('Abbott', 'Estados Unidos'),
  ('GSK', 'Reino Unido'),
  ('Merck', 'Alemania'),
  ('AstraZeneca', 'Reino Unido'),
  ('Boehringer Ingelheim', 'Alemania'),
  ('Teva', 'Israel'),
  ('Sandoz', 'Suiza'),
  ('Viatris', 'Estados Unidos'),
  ('Bausch Health', 'Canadá'),
  ('Laboratorios Dr. Collado', 'República Dominicana'),
  ('Laboratorios Rowe', 'República Dominicana'),
  ('Laboratorios Magnachem', 'República Dominicana'),
  ('Laboratorios Lam', 'República Dominicana'),
  ('Laboratorios Feltrex', 'República Dominicana'),
  ('Laboratorios Alfa', 'República Dominicana'),
  ('Laboratorios Unión', 'República Dominicana'),
  ('Laboratorios Mallén', 'República Dominicana'),
  ('Ethical Pharmaceutical', 'República Dominicana'),
  ('Laboratorios Roldán', 'República Dominicana'),
  ('Laboratorios Sued', 'República Dominicana'),
  ('Laboratorios Caplin Point Dominicana', 'República Dominicana'),
  ('Laboratorios Farach', 'República Dominicana'),
  ('Laboratorios Amadita', 'República Dominicana'),
  ('Laboratorios López', 'República Dominicana'),
  ('Laboratorios Pharmatech Dominicana', 'República Dominicana'),
  ('Laboratorios Medifarma Dominicana', 'República Dominicana'),
  ('Laboratorios Panalab Dominicana', 'República Dominicana'),
  ('Laboratorios Leterago Dominicana', 'República Dominicana'),
  ('Laboratorios Referencia', 'República Dominicana')
) as v(name, country)
where not exists (
  select 1 from laboratories l
  where l.business_id = b.id
    and lower(l.name) = lower(v.name)
);

notify pgrst, 'reload schema';
