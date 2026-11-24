-- Portfolio logos: each company's own website (bare domain). The UI shows that site's icon so people recognise the
-- brand at a glance; no website means a lettered badge instead. Domains were checked by loading each homepage.
alter table portfolio add column if not exists website text
  check (website is null or website ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$');

update portfolio p set website = v.website
from (values
  ('CommandK', 'commandk.dev'), ('Fashinza', 'fashinza.com'), ('GIVA', 'giva.co'), ('Jai Kisan', 'jaikisan.com'),
  ('Magma', 'magmagroup.in'), -- Ahmedabad B2B industrials (Neal Thakker), per Capria's portfolio page; not magmahq.ai
  ('Mailmodo', 'mailmodo.com'),
  ('MeetRecord', 'outdoo.ai'), -- renamed Outdoo in Sept 2025; meetrecord.com redirects there
  -- Produze: produze.com is still the team's domain; the same founders now run Superfuel (also Accel-backed) ('NewMe', 'newme.asia'), ('PierSight', 'piersight.space'),
  ('Produze', 'produze.com'), ('Rocketlane', 'rocketlane.com'), ('SuperK', 'superk.in'), ('SuprSend', 'suprsend.com'),
  ('The ePlane Company', 'eplane.ai'), ('Unbox Robotics', 'unboxrobotics.com'), ('Vaaree', 'vaaree.com'),
  ('Volt Money', 'voltmoney.in'), ('Wint Wealth', 'wintwealth.com')
) as v(company, website)
where p.company = v.company and p.website is null;
