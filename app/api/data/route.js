import path from 'path';

// Helper to open connection
async function getDb() {
    const { DatabaseSync } = await eval("import('node:sqlite')");
    const dbPath = path.join(process.cwd(), 'parish.db');
    return new DatabaseSync(dbPath);
}

export async function GET(request) {
    let db;
    try {
        db = await getDb();
        const { searchParams } = new URL(request.url);
        
        const onlyTable = searchParams.get('onlyTable') === 'true';
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limitParam = searchParams.get('limit') || '25';
        const isExportAll = limitParam === 'all';
        const limit = isExportAll ? 0 : parseInt(limitParam, 10);
        const search = searchParams.get('search') || '';
        const prayerGroup = searchParams.get('prayer_group') || '';
        const gender = searchParams.get('gender') || '';
        const relationship = searchParams.get('relationship') || '';
        const ageBracket = searchParams.get('age_bracket') || '';
        const distanceRange = searchParams.get('distance_range') || '';
        const sortBy = searchParams.get('sort_by') || 'last_name';
        const sortOrder = searchParams.get('sort_order') || 'asc';

        // 1. Build Query for Member Table
        let whereClauses = [];
        let params = [];

        if (search) {
            whereClauses.push(`(members.first_name LIKE ? OR members.last_name LIKE ? OR households.city LIKE ? OR households.zip LIKE ? OR households.address_1 LIKE ?)`);
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
        }

        if (prayerGroup) {
            if (prayerGroup === 'Unassigned') {
                whereClauses.push(`(households.prayer_group IS NULL OR households.prayer_group = '')`);
            } else {
                whereClauses.push(`households.prayer_group = ?`);
                params.push(prayerGroup);
            }
        }

        if (gender) {
            whereClauses.push(`members.gender = ?`);
            params.push(gender);
        }

        if (relationship) {
            whereClauses.push(`members.relationship = ?`);
            params.push(relationship);
        }

        if (ageBracket) {
            const parts = ageBracket.split('-');
            if (parts.length === 2) {
                const minAge = parseInt(parts[0], 10);
                const maxAge = parseInt(parts[1], 10);
                whereClauses.push(`members.age >= ? AND members.age <= ?`);
                params.push(minAge, maxAge);
            } else if (ageBracket.endsWith('+')) {
                const minAge = parseInt(ageBracket.slice(0, -1), 10);
                whereClauses.push(`members.age >= ?`);
                params.push(minAge);
            }
        }

        if (distanceRange) {
            if (distanceRange === '<5') {
                whereClauses.push(`households.distance_miles < 5`);
            } else if (distanceRange === '5-10') {
                whereClauses.push(`households.distance_miles >= 5 AND households.distance_miles < 10`);
            } else if (distanceRange === '10-20') {
                whereClauses.push(`households.distance_miles >= 10 AND households.distance_miles < 20`);
            } else if (distanceRange === '20-50') {
                whereClauses.push(`households.distance_miles >= 20 AND households.distance_miles < 50`);
            } else if (distanceRange === '50+') {
                whereClauses.push(`households.distance_miles >= 50`);
            }
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        
        // Sorting validation — allowlist maps UI key → qualified SQL column
        const validSortColumns = {
            first_name:      'members.first_name',
            last_name:       'members.last_name',
            age:             'members.age',
            birth_date:      'members.birth_date',
            marriage_date:   'members.marriage_date',
            gender:          'members.gender',
            relationship:    'members.relationship',
            personal_email:  'members.personal_email',
            mobile_phone:    'members.mobile_phone',
            hh_phone:        'households.phone',
            address_1:       'households.address_1',
            prayer_group:    'households.prayer_group',
            city:            'households.city',
            distance_miles:  'households.distance_miles',
            mail_to:         'households.mail_to',
            envelope_number: 'households.envelope_number'
        };
        const orderCol = validSortColumns[sortBy] || 'members.last_name';

        const orderDir = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

        // Count Total matching members
        const countQuery = `
            SELECT COUNT(*) as count 
            FROM members 
            JOIN households ON members.household_id = households.household_id
            ${whereSql}
        `;
        const totalCountResult = db.prepare(countQuery).get(...params);
        const totalItems = totalCountResult ? totalCountResult.count : 0;

        // Fetch Paginated matching members
        const offset = isExportAll ? 0 : (page - 1) * limit;
        const limitClause = isExportAll ? '' : 'LIMIT ? OFFSET ?';
        const dataQuery = `
            SELECT 
                members.*, 
                households.last_name as hh_last_name,
                households.first_name as hh_first_name,
                households.mail_to,
                households.address_1,
                households.address_2,
                households.city,
                households.state,
                households.zip,
                households.phone as hh_phone,
                households.envelope_number,
                households.prayer_group,
                households.latitude,
                households.longitude,
                households.distance_miles
            FROM members
            JOIN households ON members.household_id = households.household_id
            ${whereSql}
            ORDER BY ${orderCol} ${orderDir}
            ${limitClause}
        `;
        const queryParams = isExportAll ? params : [...params, limit, offset];
        const membersList = db.prepare(dataQuery).all(...queryParams);

        const responseData = {
            members: membersList,
            pagination: {
                totalItems,
                page,
                limit: isExportAll ? totalItems : limit,
                totalPages: isExportAll ? 1 : Math.ceil(totalItems / limit)
            }
        };

        // If only table data is requested, return it immediately
        if (onlyTable) {
            return Response.json(responseData);
        }

        // 2. Fetch Dashboard Statistics
        const totalHouseholds = db.prepare('SELECT COUNT(*) as count FROM households').get().count;
        const totalMembers = db.prepare('SELECT COUNT(*) as count FROM members').get().count;
        const activeMembers = db.prepare("SELECT COUNT(*) as count FROM members WHERE status = 'Active'").get().count;
        const activeHouseholds = db.prepare("SELECT COUNT(*) as count FROM households WHERE status = 'Active'").get().count;
        const avgDistanceRow = db.prepare("SELECT AVG(distance_miles) as avg FROM households WHERE distance_miles IS NOT NULL").get();
        const avgDistance = avgDistanceRow ? avgDistanceRow.avg : 0;
        
        // Additional stats
        const medianAgeRow = db.prepare(`
            SELECT age FROM members 
            WHERE age IS NOT NULL 
            ORDER BY age 
            LIMIT 1 OFFSET (SELECT COUNT(*) FROM members WHERE age IS NOT NULL) / 2
        `).get();
        
        const maxAgeRow = db.prepare("SELECT MAX(age) as max_age FROM members WHERE age IS NOT NULL").get();
        const minAgeRow = db.prepare("SELECT MIN(age) as min_age FROM members WHERE age IS NOT NULL AND age > 0").get();
        const avgAgeRow = db.prepare("SELECT AVG(age) as avg_age FROM members WHERE age IS NOT NULL AND age > 0").get();
        
        // Age distribution
        const ageDist = db.prepare(`
            SELECT 
                SUM(CASE WHEN age < 10 THEN 1 ELSE 0 END) as bin_0_9,
                SUM(CASE WHEN age >= 10 AND age < 20 THEN 1 ELSE 0 END) as bin_10_19,
                SUM(CASE WHEN age >= 20 AND age < 30 THEN 1 ELSE 0 END) as bin_20_29,
                SUM(CASE WHEN age >= 30 AND age < 40 THEN 1 ELSE 0 END) as bin_30_39,
                SUM(CASE WHEN age >= 40 AND age < 50 THEN 1 ELSE 0 END) as bin_40_49,
                SUM(CASE WHEN age >= 50 AND age < 60 THEN 1 ELSE 0 END) as bin_50_59,
                SUM(CASE WHEN age >= 60 AND age < 70 THEN 1 ELSE 0 END) as bin_60_69,
                SUM(CASE WHEN age >= 70 THEN 1 ELSE 0 END) as bin_70_plus
            FROM members
        `).get();

        // Gender distribution
        const genderDist = db.prepare('SELECT gender, COUNT(*) as count FROM members GROUP BY gender').all();

        // Location distribution (Cities)
        const cityDist = db.prepare('SELECT city, COUNT(*) as count FROM households GROUP BY city ORDER BY count DESC LIMIT 15').all();

        // Distance distribution
        const distanceDist = db.prepare(`
            SELECT 
                SUM(CASE WHEN distance_miles < 5 THEN 1 ELSE 0 END) as bin_under_5,
                SUM(CASE WHEN distance_miles >= 5 AND distance_miles < 10 THEN 1 ELSE 0 END) as bin_5_10,
                SUM(CASE WHEN distance_miles >= 10 AND distance_miles < 20 THEN 1 ELSE 0 END) as bin_10_20,
                SUM(CASE WHEN distance_miles >= 20 AND distance_miles < 50 THEN 1 ELSE 0 END) as bin_20_50,
                SUM(CASE WHEN distance_miles >= 50 THEN 1 ELSE 0 END) as bin_50_plus
            FROM households
        `).get();

        // Prayer Group member counts
        const groupDist = db.prepare(`
            SELECT 
                COALESCE(NULLIF(households.prayer_group, ''), 'Unassigned') as name, 
                COUNT(members.member_id) as count 
            FROM members 
            JOIN households ON members.household_id = households.household_id 
            GROUP BY households.prayer_group 
            ORDER BY count DESC
        `).all();

        // Prayer Group household counts
        const groupHhDist = db.prepare(`
            SELECT 
                COALESCE(NULLIF(prayer_group, ''), 'Unassigned') as name, 
                COUNT(*) as count 
            FROM households 
            GROUP BY prayer_group 
            ORDER BY count DESC
        `).all();

        // Relationship distribution
        const relationshipDist = db.prepare(`
            SELECT 
                COALESCE(NULLIF(relationship, ''), 'Unknown') as name, 
                COUNT(*) as count 
            FROM members 
            GROUP BY relationship 
            ORDER BY count DESC
        `).all();

        // History: Households registered per year
        const historyHh = db.prepare(`
            SELECT strftime('%Y', added_date) as year, COUNT(*) as count 
            FROM households 
            WHERE added_date IS NOT NULL AND added_date != ''
            GROUP BY year 
            ORDER BY year ASC
        `).all();

        // History: Members registered per year
        const historyMem = db.prepare(`
            SELECT strftime('%Y', date_added) as year, COUNT(*) as count 
            FROM members 
            WHERE date_added IS NOT NULL AND date_added != ''
            GROUP BY year 
            ORDER BY year ASC
        `).all();

        // Map markers (lat/lon of households)
        const mapMarkers = db.prepare(`
            SELECT
                household_id, mail_to, first_name, last_name,
                address_1, city, prayer_group, latitude, longitude, distance_miles,
                envelope_number
            FROM households
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        `).all();

        // ==================== Financial Statistics ====================
        // Check if financial_contributions table exists
        let financialStats = null;
        try {
            const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_contributions'").get();
            if (tableCheck) {
                // Total contributions
                const totalContributions = db.prepare("SELECT SUM(amount) as total FROM financial_contributions").get();
                const totalRecords = db.prepare("SELECT COUNT(*) as count FROM financial_contributions").get();
                const uniqueDonors = db.prepare("SELECT COUNT(DISTINCT donor_number) as count FROM financial_contributions").get();
                const householdsWithGiving = db.prepare("SELECT COUNT(DISTINCT household_id) as count FROM financial_contributions WHERE household_id IS NOT NULL").get();

                // Average donation
                const avgDonation = db.prepare("SELECT AVG(amount) as avg FROM financial_contributions WHERE amount > 0").get();

                // Giving by fund
                const byFund = db.prepare(`
                    SELECT fund_name, SUM(amount) as total, COUNT(*) as count
                    FROM financial_contributions
                    WHERE fund_name IS NOT NULL AND fund_name != ''
                    GROUP BY fund_name
                    ORDER BY total DESC
                `).all();

                // Giving by year
                const byYear = db.prepare(`
                    SELECT strftime('%Y', giving_date) as year, SUM(amount) as total, COUNT(*) as count
                    FROM financial_contributions
                    WHERE giving_date IS NOT NULL AND giving_date != ''
                    GROUP BY year
                    ORDER BY year DESC
                `).all();

                // Giving by month (current year)
                const byMonth = db.prepare(`
                    SELECT strftime('%Y-%m', giving_date) as month, SUM(amount) as total, COUNT(*) as count
                    FROM financial_contributions
                    WHERE giving_date IS NOT NULL AND giving_date != ''
                    GROUP BY month
                    ORDER BY month DESC
                    LIMIT 12
                `).all();

                // Top donors
                const topDonors = db.prepare(`
                    SELECT
                        fc.donor_number,
                        fc.family_last_name,
                        fc.family_first_name,
                        SUM(fc.amount) as total_giving,
                        COUNT(*) as gift_count,
                        fc.household_id,
                        households.mail_to
                    FROM financial_contributions fc
                    LEFT JOIN households ON fc.household_id = households.household_id
                    GROUP BY fc.donor_number
                    ORDER BY total_giving DESC
                    LIMIT 20
                `).all();

                // Giving by prayer group
                const byPrayerGroup = db.prepare(`
                    SELECT
                        COALESCE(NULLIF(households.prayer_group, ''), 'Unassigned') as prayer_group,
                        SUM(fc.amount) as total,
                        COUNT(DISTINCT fc.household_id) as household_count,
                        COUNT(*) as gift_count
                    FROM financial_contributions fc
                    JOIN households ON fc.household_id = households.household_id
                    WHERE fc.household_id IS NOT NULL
                    GROUP BY households.prayer_group
                    ORDER BY total DESC
                `).all();

                // Giving by currency type
                const byCurrency = db.prepare(`
                    SELECT currency_type, SUM(amount) as total, COUNT(*) as count
                    FROM financial_contributions
                    WHERE currency_type IS NOT NULL AND currency_type != ''
                    GROUP BY currency_type
                `).all();

                // All contributions (for filtering)
                const allContributions = db.prepare(`
                    SELECT
                        fc.*,
                        households.mail_to,
                        households.prayer_group
                    FROM financial_contributions fc
                    LEFT JOIN households ON fc.household_id = households.household_id
                    ORDER BY fc.giving_date DESC, fc.id DESC
                `).all();

                // Recent contributions (last 50 for display)
                const recentContributions = allContributions.slice(0, 50);

                // Year-over-year trend (ascending order for charts)
                const yearlyTrend = db.prepare(`
                    SELECT strftime('%Y', giving_date) as year, SUM(amount) as total, COUNT(*) as count,
                           COUNT(DISTINCT donor_number) as donor_count
                    FROM financial_contributions
                    WHERE giving_date IS NOT NULL AND giving_date != ''
                    GROUP BY year
                    ORDER BY year ASC
                `).all();

                // Monthly trend for each year
                const monthlyTrend = db.prepare(`
                    SELECT strftime('%Y', giving_date) as year,
                           strftime('%m', giving_date) as month,
                           SUM(amount) as total,
                           COUNT(*) as count
                    FROM financial_contributions
                    WHERE giving_date IS NOT NULL AND giving_date != ''
                    GROUP BY year, month
                    ORDER BY year ASC, month ASC
                `).all();

                // Fund breakdown by year
                const fundByYear = db.prepare(`
                    SELECT fund_name,
                           strftime('%Y', giving_date) as year,
                           SUM(amount) as total,
                           COUNT(*) as count
                    FROM financial_contributions
                    WHERE fund_name IS NOT NULL AND fund_name != ''
                      AND giving_date IS NOT NULL AND giving_date != ''
                    GROUP BY fund_name, year
                    ORDER BY year ASC, total DESC
                `).all();

                // Get all available years
                const availableYears = db.prepare(`
                    SELECT DISTINCT strftime('%Y', giving_date) as year
                    FROM financial_contributions
                    WHERE giving_date IS NOT NULL AND giving_date != ''
                    ORDER BY year DESC
                `).all();

                // All households (for non-donor computation on frontend)
                const allHouseholds = db.prepare(`
                    SELECT household_id, mail_to, first_name, last_name, city, prayer_group, envelope_number
                    FROM households
                    ORDER BY last_name ASC, first_name ASC
                `).all();

                financialStats = {
                    totalContributions: totalContributions?.total || 0,
                    totalRecords: totalRecords?.count || 0,
                    uniqueDonors: uniqueDonors?.count || 0,
                    householdsWithGiving: householdsWithGiving?.count || 0,
                    avgDonation: avgDonation?.avg || 0,
                    byFund,
                    byYear,
                    byMonth,
                    yearlyTrend,
                    monthlyTrend,
                    fundByYear,
                    availableYears: availableYears.map(y => y.year),
                    topDonors,
                    byPrayerGroup,
                    byCurrency,
                    recentContributions,
                    allContributions,
                    allHouseholds
                };
            }
        } catch (err) {
            console.error("Error fetching financial stats:", err);
        }

        // Populate dashboard stats in responseData
        responseData.stats = {
            totalHouseholds,
            totalMembers,
            activeMembers,
            activeHouseholds,
            avgDistance: avgDistance || 0,
            avgFamilySize: totalHouseholds > 0 ? (totalMembers / totalHouseholds) : 0,
            medianAge: medianAgeRow ? medianAgeRow.age : null,
            maxAge: maxAgeRow ? maxAgeRow.max_age : null,
            minAge: minAgeRow ? minAgeRow.min_age : null,
            avgAge: avgAgeRow ? avgAgeRow.avg_age : null,
            distributions: {
                age: {
                    '0-9': ageDist.bin_0_9 || 0,
                    '10-19': ageDist.bin_10_19 || 0,
                    '20-29': ageDist.bin_20_29 || 0,
                    '30-39': ageDist.bin_30_39 || 0,
                    '40-49': ageDist.bin_40_49 || 0,
                    '50-59': ageDist.bin_50_59 || 0,
                    '60-69': ageDist.bin_60_69 || 0,
                    '70+': ageDist.bin_70_plus || 0
                },
                gender: genderDist.reduce((acc, curr) => {
                    acc[curr.gender || 'Unknown'] = curr.count;
                    return acc;
                }, {}),
                city: cityDist,
                distance: {
                    '<5 miles': distanceDist.bin_under_5 || 0,
                    '5-10 miles': distanceDist.bin_5_10 || 0,
                    '10-20 miles': distanceDist.bin_10_20 || 0,
                    '20-50 miles': distanceDist.bin_20_50 || 0,
                    '50+ miles': distanceDist.bin_50_plus || 0
                },
                prayerGroup: groupDist,
                prayerGroupHh: groupHhDist,
                relationship: relationshipDist,
                history: {
                    households: historyHh,
                    members: historyMem
                }
            },
            mapMarkers,
            financial: financialStats
        };

        // Fetch and classify birthdays and anniversaries
        const allMembersWithDates = db.prepare(`
            SELECT 
                members.member_id,
                members.household_id,
                members.first_name,
                members.last_name,
                members.relationship,
                members.birth_date,
                members.marriage_date,
                households.mail_to,
                households.last_name as hh_last_name
            FROM members
            JOIN households ON members.household_id = households.household_id
            WHERE (members.birth_date IS NOT NULL AND members.birth_date != '') 
               OR (members.marriage_date IS NOT NULL AND members.marriage_date != '')
        `).all();

        responseData.stats.events = classifyEvents(allMembersWithDates);

        return Response.json(responseData);
    } catch (error) {
        console.error("API error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    } finally {
        if (db) {
            db.close();
        }
    }
}

// Helper to construct event date candidates in current, previous, and next year
function getEventCandidates(dateStr, refDate) {
    if (!dateStr) return [];
    const parts = dateStr.split('-');
    if (parts.length !== 3) return [];
    const birthYear = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (isNaN(birthYear) || isNaN(month) || isNaN(day)) return [];

    const refYear = refDate.getFullYear();
    return [
        { date: new Date(refYear - 1, month - 1, day, 0, 0, 0, 0), year: refYear - 1, originalYear: birthYear },
        { date: new Date(refYear, month - 1, day, 0, 0, 0, 0), year: refYear, originalYear: birthYear },
        { date: new Date(refYear + 1, month - 1, day, 0, 0, 0, 0), year: refYear + 1, originalYear: birthYear }
    ];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatMonthDay(date) {
    const m = MONTHS[date.getMonth()];
    const d = String(date.getDate()).padStart(2, '0');
    return `${m} ${d}`;
}

// Helper to classify events into relative date ranges
function classifyEvents(members, refDate = new Date()) {
    const todayStart = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 0, 0, 0, 0);
    const oneDay = 24 * 60 * 60 * 1000;

    const ranges = {
        today: {
            start: todayStart,
            end: new Date(todayStart.getTime() + oneDay - 1)
        },
        tomorrow: {
            start: new Date(todayStart.getTime() + oneDay),
            end: new Date(todayStart.getTime() + 2 * oneDay - 1)
        },
        this_week: {
            start: new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() - todayStart.getDay(), 0, 0, 0, 0),
            end: null
        },
        next_week: {
            start: new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() - todayStart.getDay() + 7, 0, 0, 0, 0),
            end: null
        },
        this_month: {
            start: new Date(todayStart.getFullYear(), todayStart.getMonth(), 1, 0, 0, 0, 0),
            end: new Date(new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1, 0, 0, 0, 0) - 1)
        },
        next_month: {
            start: new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1, 0, 0, 0, 0),
            end: new Date(new Date(todayStart.getFullYear(), todayStart.getMonth() + 2, 1, 0, 0, 0, 0) - 1)
        }
    };

    ranges.this_week.end = new Date(ranges.this_week.start.getTime() + 7 * oneDay - 1);
    ranges.next_week.end = new Date(ranges.next_week.start.getTime() + 7 * oneDay - 1);

    const birthdayLists = {
        today: [],
        tomorrow: [],
        this_week: [],
        next_week: [],
        this_month: [],
        next_month: []
    };

    const anniversaryLists = {
        today: [],
        tomorrow: [],
        this_week: [],
        next_week: [],
        this_month: [],
        next_month: []
    };

    const hhAnniversaries = {};

    for (const m of members) {
        // Birthdays
        if (m.birth_date && m.birth_date.trim() !== '') {
            const candidates = getEventCandidates(m.birth_date, refDate);
            for (const c of candidates) {
                const time = c.date.getTime();
                for (const [key, range] of Object.entries(ranges)) {
                    if (time >= range.start.getTime() && time <= range.end.getTime()) {
                        birthdayLists[key].push({
                            member_id: m.member_id,
                            first_name: m.first_name,
                            last_name: m.last_name,
                            relationship: m.relationship,
                            birth_date: m.birth_date,
                            event_date: c.date,
                            month_day_str: formatMonthDay(c.date),
                            turning: c.year - c.originalYear
                        });
                    }
                }
            }
        }

        // Anniversaries
        if (m.marriage_date && m.marriage_date.trim() !== '') {
            const candidates = getEventCandidates(m.marriage_date, refDate);
            for (const c of candidates) {
                const time = c.date.getTime();
                for (const [key, range] of Object.entries(ranges)) {
                    if (time >= range.start.getTime() && time <= range.end.getTime()) {
                        const keyId = `${m.household_id}|${m.marriage_date}|${key}`;
                        if (!hhAnniversaries[keyId]) {
                            hhAnniversaries[keyId] = {
                                household_id: m.household_id,
                                mail_to: m.mail_to,
                                hh_last_name: m.hh_last_name || m.last_name,
                                marriage_date: m.marriage_date,
                                event_date: c.date,
                                month_day_str: formatMonthDay(c.date),
                                years: c.year - c.originalYear,
                                members: []
                            };
                        }
                        hhAnniversaries[keyId].members.push(m);
                    }
                }
            }
        }
    }

    // Process anniversaries grouping
    for (const [keyId, ann] of Object.entries(hhAnniversaries)) {
        const key = keyId.split('|').pop();

        const head = ann.members.find(m => m.relationship === 'Head');
        const spouse = ann.members.find(m => m.relationship === 'Spouse');
        let names = ann.mail_to;
        if (head && spouse) {
            names = `${head.first_name} & ${spouse.first_name} ${head.last_name}`;
        } else if (ann.members.length > 0) {
            const fNames = Array.from(new Set(ann.members.map(m => m.first_name)));
            names = fNames.join(' & ') + ' ' + (ann.hh_last_name || '');
        }

        anniversaryLists[key].push({
            household_id: ann.household_id,
            names,
            marriage_date: ann.marriage_date,
            event_date: ann.event_date,
            month_day_str: ann.month_day_str,
            years: ann.years
        });
    }

    // Sort chronologically
    const sortByEventDate = (a, b) => a.event_date.getTime() - b.event_date.getTime();

    for (const key of Object.keys(birthdayLists)) {
        birthdayLists[key].sort(sortByEventDate);
    }
    for (const key of Object.keys(anniversaryLists)) {
        anniversaryLists[key].sort(sortByEventDate);
    }

    return { birthdays: birthdayLists, anniversaries: anniversaryLists };
}
