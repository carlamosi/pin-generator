-- 20260831120000_passport_scans_bucket.sql

-- Insert passport-scans bucket if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('passport-scans', 'passport-scans', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for passport-scans bucket
CREATE POLICY "Enable read access for passport-scans" ON storage.objects
FOR SELECT USING (bucket_id = 'passport-scans');

CREATE POLICY "Enable insert access for passport-scans" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'passport-scans');

CREATE POLICY "Enable update access for passport-scans" ON storage.objects
FOR UPDATE USING (bucket_id = 'passport-scans');

CREATE POLICY "Enable delete access for passport-scans" ON storage.objects
FOR DELETE USING (bucket_id = 'passport-scans');
