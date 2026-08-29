import openpyxl; wb = openpyxl.load_workbook('C:/Users/carla/Desktop/Projects/pin_collector/mis_viajes.xlsx'); ws = wb['Viajes']; sql = 'INSERT INTO trips (name, start_date, end_date, country) VALUES '; values = [];
for r in ws.iter_rows(min_row=5, values_only=True):
    if not r[0] or not r[1]: continue
    name = str(r[1]).replace("'", "''")
    start_date = f"'{str(r[2]).split()[0]}'" if r[2] else 'NULL'
    end_date = f"'{str(r[3]).split()[0]}'" if r[3] else 'NULL'
    values.append(f"('{name}', {start_date}, {end_date}, 'Varios')")
with open('C:/Users/carla/Desktop/Projects/pin_collector/pin-generator/supabase/migrations/seed_trips.sql', 'w', encoding='utf-8') as f:
    f.write(sql + ',\n'.join(values) + ';')
