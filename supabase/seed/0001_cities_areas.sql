-- ═══════════════════════════════════════════════════════════════════════════
-- Cities and areas — pan-India
--
-- Tiering via cities.is_live, which the app already respects (CatalogService
-- filters on it, and onboarding only offers live cities):
--
--   Tier A  is_live = true   launch markets, seeded with areas and venues
--   Tier B  is_live = false  real garba culture, thinner data — fast follow
--   Tier C  is_live = false  SEO capture + waitlist; flip to true when density
--                            arrives
--
-- Ahmedabad / Gandhinagar / Vadodara / Surat are deliberately NOT live. The
-- incumbent holds indexed city pages there; fighting for those four first
-- wastes the one advantage we have, which is that the rest of India is open.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tier A: launch ────────────────────────────────────────────────────────
insert into cities (name, state, slug, is_live) values
  ('Rajkot',      'Gujarat',        'rajkot',      true),
  ('Mumbai',      'Maharashtra',    'mumbai',      true),
  ('Pune',        'Maharashtra',    'pune',        true),
  ('Indore',      'Madhya Pradesh', 'indore',      true),
  ('Jaipur',      'Rajasthan',      'jaipur',      true),
  ('Thane',       'Maharashtra',    'thane',       true),
  ('Delhi',       'Delhi',          'delhi',       true),
  ('Bengaluru',   'Karnataka',      'bengaluru',   true),
  ('Hyderabad',   'Telangana',      'hyderabad',   true),
  ('Bhopal',      'Madhya Pradesh', 'bhopal',      true)
on conflict (slug) do nothing;

-- ── Tier B: fast follow ───────────────────────────────────────────────────
insert into cities (name, state, slug, is_live) values
  ('Nashik',      'Maharashtra',    'nashik',      false),
  ('Nagpur',      'Maharashtra',    'nagpur',      false),
  ('Navi Mumbai', 'Maharashtra',    'navi-mumbai', false),
  ('Udaipur',     'Rajasthan',      'udaipur',     false),
  ('Jodhpur',     'Rajasthan',      'jodhpur',     false),
  ('Bhavnagar',   'Gujarat',        'bhavnagar',   false),
  ('Jamnagar',    'Gujarat',        'jamnagar',    false),
  ('Anand',       'Gujarat',        'anand',       false),
  ('Ujjain',      'Madhya Pradesh', 'ujjain',      false),
  ('Gurugram',    'Haryana',        'gurugram',    false),
  ('Noida',       'Uttar Pradesh',  'noida',       false),
  ('Jabalpur',    'Madhya Pradesh', 'jabalpur',    false)
on conflict (slug) do nothing;

-- ── Tier C: SEO capture + waitlist ────────────────────────────────────────
insert into cities (name, state, slug, is_live) values
  ('Ahmedabad',   'Gujarat',        'ahmedabad',   false),
  ('Gandhinagar', 'Gujarat',        'gandhinagar', false),
  ('Vadodara',    'Gujarat',        'vadodara',    false),
  ('Surat',       'Gujarat',        'surat',       false),
  ('Junagadh',    'Gujarat',        'junagadh',    false),
  ('Gandhidham',  'Gujarat',        'gandhidham',  false),
  ('Kota',        'Rajasthan',      'kota',        false),
  ('Chennai',     'Tamil Nadu',     'chennai',     false),
  ('Kolkata',     'West Bengal',    'kolkata',     false),
  ('Lucknow',     'Uttar Pradesh',  'lucknow',     false),
  ('Chandigarh',  'Chandigarh',     'chandigarh',  false),
  ('Ghaziabad',   'Uttar Pradesh',  'ghaziabad',   false)
on conflict (slug) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- Areas for the five focus cities.
--
-- Areas do the work GPS is not allowed to do: they let "near me" mean
-- something without ever tracking anyone. Real neighbourhood names matter —
-- a user picks the one they actually say out loud.
-- ═══════════════════════════════════════════════════════════════════════════

insert into areas (city_id, name, slug)
select c.id, a.name, a.slug
from cities c
join (values
  -- Rajkot
  ('rajkot', 'Kalavad Road',         'kalavad-road'),
  ('rajkot', 'University Road',      'university-road'),
  ('rajkot', 'Race Course',          'race-course'),
  ('rajkot', 'Gondal Road',          'gondal-road'),
  ('rajkot', 'Mavdi',                'mavdi'),
  ('rajkot', 'Raiya Road',           'raiya-road'),
  ('rajkot', '150 Feet Ring Road',   '150-feet-ring-road'),
  ('rajkot', 'Jamnagar Road',        'jamnagar-road'),

  -- Mumbai
  ('mumbai', 'Borivali',             'borivali'),
  ('mumbai', 'Kandivali',            'kandivali'),
  ('mumbai', 'Malad',                'malad'),
  ('mumbai', 'Andheri',              'andheri'),
  ('mumbai', 'Vile Parle',           'vile-parle'),
  ('mumbai', 'Dadar',                'dadar'),
  ('mumbai', 'Ghatkopar',            'ghatkopar'),
  ('mumbai', 'Mulund',               'mulund'),
  ('mumbai', 'Chembur',              'chembur'),
  ('mumbai', 'Bandra Kurla Complex', 'bkc'),
  ('mumbai', 'Sion',                 'sion'),

  -- Pune
  ('pune',   'Kothrud',              'kothrud'),
  ('pune',   'Baner',                'baner'),
  ('pune',   'Aundh',                'aundh'),
  ('pune',   'Hinjewadi',            'hinjewadi'),
  ('pune',   'Wakad',                'wakad'),
  ('pune',   'Viman Nagar',          'viman-nagar'),
  ('pune',   'Kharadi',              'kharadi'),
  ('pune',   'Hadapsar',             'hadapsar'),
  ('pune',   'Camp',                 'camp'),

  -- Indore
  ('indore', 'Vijay Nagar',          'vijay-nagar'),
  ('indore', 'Palasia',              'palasia'),
  ('indore', 'AB Road',              'ab-road'),
  ('indore', 'Bhawarkuan',           'bhawarkuan'),
  ('indore', 'Rau',                  'rau'),
  ('indore', 'Sudama Nagar',         'sudama-nagar'),
  ('indore', 'Scheme 78',            'scheme-78'),

  -- Jaipur
  ('jaipur', 'Malviya Nagar',        'malviya-nagar'),
  ('jaipur', 'Vaishali Nagar',       'vaishali-nagar'),
  ('jaipur', 'C-Scheme',             'c-scheme'),
  ('jaipur', 'Mansarovar',           'mansarovar'),
  ('jaipur', 'Jagatpura',            'jagatpura'),
  ('jaipur', 'Tonk Road',            'tonk-road'),
  ('jaipur', 'Bani Park',            'bani-park')
) as a(city_slug, name, slug) on a.city_slug = c.slug
on conflict (city_id, slug) do nothing;


-- ── Areas for the remaining live cities ───────────────────────────────────
-- A live city with no areas cannot do location matching beyond "same city",
-- which in Delhi or Bengaluru is useless — Rohini to Saket is 30 km.
insert into areas (city_id, name, slug)
select c.id, a.name, a.slug
from cities c
join (values
  -- Delhi
  ('delhi',     'Rohini',            'rohini'),
  ('delhi',     'Dwarka',            'dwarka'),
  ('delhi',     'Pitampura',         'pitampura'),
  ('delhi',     'Janakpuri',         'janakpuri'),
  ('delhi',     'Karol Bagh',        'karol-bagh'),
  ('delhi',     'Lajpat Nagar',      'lajpat-nagar'),
  ('delhi',     'Saket',             'saket'),
  ('delhi',     'Vasant Kunj',       'vasant-kunj'),
  ('delhi',     'Mayur Vihar',       'mayur-vihar'),
  ('delhi',     'Preet Vihar',       'preet-vihar'),

  -- Bengaluru
  ('bengaluru', 'Indiranagar',       'indiranagar'),
  ('bengaluru', 'Koramangala',       'koramangala'),
  ('bengaluru', 'Whitefield',        'whitefield'),
  ('bengaluru', 'Jayanagar',         'jayanagar'),
  ('bengaluru', 'HSR Layout',        'hsr-layout'),
  ('bengaluru', 'Marathahalli',      'marathahalli'),
  ('bengaluru', 'Rajajinagar',       'rajajinagar'),
  ('bengaluru', 'Malleshwaram',      'malleshwaram'),
  ('bengaluru', 'Electronic City',   'electronic-city'),
  ('bengaluru', 'Yelahanka',         'yelahanka'),

  -- Hyderabad
  ('hyderabad', 'Gachibowli',        'gachibowli'),
  ('hyderabad', 'Madhapur',          'madhapur'),
  ('hyderabad', 'Kukatpally',        'kukatpally'),
  ('hyderabad', 'Banjara Hills',     'banjara-hills'),
  ('hyderabad', 'Jubilee Hills',     'jubilee-hills'),
  ('hyderabad', 'Secunderabad',      'secunderabad'),
  ('hyderabad', 'Miyapur',           'miyapur'),
  ('hyderabad', 'Ameerpet',          'ameerpet'),
  ('hyderabad', 'Kondapur',          'kondapur'),

  -- Thane
  ('thane',     'Ghodbunder Road',   'ghodbunder-road'),
  ('thane',     'Vartak Nagar',      'vartak-nagar'),
  ('thane',     'Naupada',           'naupada'),
  ('thane',     'Kolshet',           'kolshet'),
  ('thane',     'Majiwada',          'majiwada'),
  ('thane',     'Wagle Estate',      'wagle-estate'),
  ('thane',     'Kasarvadavali',     'kasarvadavali'),

  -- Bhopal
  ('bhopal',    'Arera Colony',      'arera-colony'),
  ('bhopal',    'MP Nagar',          'mp-nagar'),
  ('bhopal',    'Kolar Road',        'kolar-road'),
  ('bhopal',    'Shahpura',          'shahpura'),
  ('bhopal',    'New Market',        'new-market'),
  ('bhopal',    'Hoshangabad Road',  'hoshangabad-road'),
  ('bhopal',    'Bairagarh',         'bairagarh')
) as a(city_slug, name, slug) on a.city_slug = c.slug
on conflict (city_id, slug) do nothing;
