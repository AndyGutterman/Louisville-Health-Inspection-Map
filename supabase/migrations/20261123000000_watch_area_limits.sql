-- Watch areas: 3 per account (unchanged), 5 miles at most (was 25).
-- Why: an area's list is read from the database every time its owner opens Saved. The
-- website asks for only the 50 places with the most violations in each area, so three
-- areas cost 150 small rows at most, whatever their size; the radius cap keeps the
-- database's own work per read small. The website has the same limits
-- (apps/web/src/watchAreaLayer.js, WatchlistTab.jsx).
-- Deletes nothing. Safe to run more than once. Saved places stay capped at 30.

UPDATE public.watchlist_areas SET radius_miles = 5 WHERE radius_miles > 5;

ALTER TABLE public.watchlist_areas ALTER COLUMN radius_miles SET DEFAULT 2;
ALTER TABLE public.watchlist_areas DROP CONSTRAINT IF EXISTS watchlist_areas_radius;
ALTER TABLE public.watchlist_areas
  ADD CONSTRAINT watchlist_areas_radius CHECK (radius_miles >= 1 AND radius_miles <= 5);

DROP TRIGGER IF EXISTS cap_watchlist_areas ON public.watchlist_areas;
CREATE TRIGGER cap_watchlist_areas BEFORE INSERT ON public.watchlist_areas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_row_cap('3');
