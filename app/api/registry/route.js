import path from 'path';

async function getDb() {
    const { DatabaseSync } = await eval("import('node:sqlite')");
    const dbPath = path.join(process.cwd(), 'parish.db');
    return new DatabaseSync(dbPath);
}

export async function GET() {
    let db;
    try {
        db = await getDb();

        // Fetch all households joined with their members, ordered alphabetically
        const rows = db.prepare(`
            SELECT
                h.household_id,
                h.mail_to,
                h.first_name  AS hh_first_name,
                h.last_name   AS hh_last_name,
                h.address_1,
                h.address_2,
                h.city,
                h.state,
                h.zip,
                h.phone       AS hh_phone,
                h.envelope_number,
                h.prayer_group,
                m.member_id,
                m.first_name,
                m.last_name,
                m.relationship,
                m.birth_date,
                m.marriage_date,
                m.personal_email,
                m.mobile_phone,
                m.home_phone
            FROM households h
            LEFT JOIN members m ON h.household_id = m.household_id
            ORDER BY
                h.last_name  ASC,
                h.first_name ASC,
                CASE m.relationship
                    WHEN 'Head'    THEN 1
                    WHEN 'Husband' THEN 1
                    WHEN 'Spouse'  THEN 2
                    WHEN 'Wife'    THEN 2
                    ELSE 3
                END ASC,
                m.first_name ASC
        `).all();

        // Group rows by household
        const householdMap = {};
        const householdOrder = [];

        for (const row of rows) {
            if (!householdMap[row.household_id]) {
                householdMap[row.household_id] = {
                    household_id:   row.household_id,
                    mail_to:        row.mail_to,
                    hh_first_name:  row.hh_first_name,
                    hh_last_name:   row.hh_last_name,
                    address_1:      row.address_1,
                    address_2:      row.address_2,
                    city:           row.city,
                    state:          row.state,
                    zip:            row.zip,
                    hh_phone:       row.hh_phone,
                    envelope_number: row.envelope_number,
                    prayer_group:   row.prayer_group,
                    // derived — filled from first matching member below
                    email:          null,
                    phone:          null,
                    marriage_date:  null,
                    members:        []
                };
                householdOrder.push(row.household_id);
            }

            const hh = householdMap[row.household_id];

            if (row.member_id) {
                hh.members.push({
                    member_id:     row.member_id,
                    first_name:    row.first_name,
                    last_name:     row.last_name,
                    relationship:  row.relationship,
                    birth_date:    row.birth_date,
                    marriage_date: row.marriage_date,
                    personal_email: row.personal_email,
                    mobile_phone:  row.mobile_phone,
                    home_phone:    row.home_phone
                });

                // Prefer head/husband for email, marriage date, phone
                const isHead = ['Head', 'Husband'].includes(row.relationship);
                if (!hh.email && row.personal_email && isHead) hh.email = row.personal_email;
                if (!hh.marriage_date && row.marriage_date && isHead) hh.marriage_date = row.marriage_date;
                if (!hh.phone && row.mobile_phone && isHead) hh.phone = row.mobile_phone;
            }
        }

        // Resolve fallbacks for derived fields
        const households = householdOrder.map(id => {
            const hh = householdMap[id];
            const firstMember = hh.members[0];
            return {
                ...hh,
                email:         hh.email         || firstMember?.personal_email || '',
                phone:         hh.phone         || hh.hh_phone || firstMember?.mobile_phone || firstMember?.home_phone || '',
                marriage_date: hh.marriage_date || hh.members.find(m => m.marriage_date)?.marriage_date || ''
            };
        });

        return Response.json({ households });
    } catch (error) {
        console.error('Registry API error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    } finally {
        if (db) db.close();
    }
}
