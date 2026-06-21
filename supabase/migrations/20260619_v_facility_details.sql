-- v_facility_details
-- Joins facilities + facility_categories so beginDrawerLoad can fetch
-- all detail fields in a single .maybeSingle() call instead of two sequential queries.

CREATE OR REPLACE VIEW public.v_facility_details AS
SELECT
  f.establishment_id,
  f.opening_date,
  f.facility_type,
  f.subtype,
  f.address,
  f.city,
  f.state,
  f.zip,
  f.permit_number,
  f.name,
  fc.facility_type_description,
  fc.subtype_description
FROM public.facilities f
LEFT JOIN public.facility_categories fc
  ON fc.facility_type = f.facility_type
  AND fc.subtype = f.subtype;

-- Allow the anon role to SELECT from this view (same access as the tables it joins)
GRANT SELECT ON public.v_facility_details TO anon, authenticated;
