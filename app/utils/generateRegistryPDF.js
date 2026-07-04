/**
 * generateRegistryPDF.js
 * Landscape letter-size PDF Parish Registry.
 *  - Cover page: church logo + title
 *  - Every page: small logo in the top header bar
 *  - Info card (per family): Address | Donor # | Prayer Group
 *  - Members table: Name | Relationship | DOB | Marriage Date | Phone | Email
 *  - Footer: date (left) · page number (right)
 */

export async function generateRegistryPDF(setGenerating) {
  try {
    if (setGenerating) setGenerating(true);

    // ── Dynamic imports (client-only) ─────────────────────────────────────────
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    // ── Load logo ─────────────────────────────────────────────────────────────
    let logoDataURL = null;
    let logoAspect  = 1; // width / height

    try {
      const imgRes = await fetch('/logocolor.png');
      const blob   = await imgRes.blob();
      logoDataURL  = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      // Determine natural aspect ratio
      logoAspect = await new Promise((resolve) => {
        const img   = new window.Image();
        img.onload  = () => resolve(img.naturalWidth / img.naturalHeight);
        img.onerror = () => resolve(1);
        img.src     = logoDataURL;
      });
    } catch (e) {
      console.warn('Logo could not be loaded — continuing without it.', e);
    }

    // ── Fetch registry data ───────────────────────────────────────────────────
    const apiRes = await fetch('/api/registry');
    if (!apiRes.ok) throw new Error('Failed to fetch registry data');
    const { households } = await apiRes.json();

    if (!households?.length) {
      alert('No household data found.');
      return;
    }

    // ── Document setup ────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();   // 279.4 mm
    const H   = doc.internal.pageSize.getHeight();  // 215.9 mm
    const ML  = 13;                                 // left margin
    const MR  = 13;                                 // right margin
    const CW  = W - ML - MR;                        // 253.4 mm usable width

    const today = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    const totalPages = households.length + 1; // cover + one per family

    // ── Colour palette ────────────────────────────────────────────────────────
    const NAVY   = [20,  52,  120];
    const BLUE   = [59,  130, 246];
    const DARK   = [15,  23,  42];
    const MUTED  = [100, 116, 139];
    const LIGHT  = [241, 245, 249];
    const WHITE  = [255, 255, 255];
    const BORDER = [203, 213, 225];

    // ── Logo sizing ───────────────────────────────────────────────────────────
    const HEADER_H      = 13;                          // page header bar height
    const HDR_LOGO_H    = 9;                           // logo height in header
    const HDR_LOGO_W    = HDR_LOGO_H * logoAspect;    // logo width in header
    const COVER_LOGO_H  = 44;                          // logo height on cover
    const COVER_LOGO_W  = COVER_LOGO_H * logoAspect;  // logo width on cover

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Footer: date bottom-left, page X of Y bottom-right */
    const drawFooter = (pageNum) => {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.25);
      doc.line(ML, H - 8, W - MR, H - 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(today, ML, H - 4);
      doc.text(`Page ${pageNum} of ${totalPages}`, W - MR, H - 4, { align: 'right' });
    };

    /** Navy header bar with small logo (left) + church name (centred) */
    const drawPageHeader = () => {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, W, HEADER_H, 'F');

      // Small logo on the left
      if (logoDataURL) {
        const logoY = (HEADER_H - HDR_LOGO_H) / 2;
        doc.addImage(logoDataURL, 'PNG', 3, logoY, HDR_LOGO_W, HDR_LOGO_H);
      }

      // Church name centred
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      doc.text(
        'Mar Thoma Church Of San Francisco  \u2022  Parish Registry',
        W / 2,
        HEADER_H / 2 + 1.8,
        { align: 'center' }
      );
    };

    /**
     * Renders a labelled field (small-caps label + value below).
     * @returns {number} total height consumed (mm)
     */
    const drawField = (label, value, x, y, maxWidth) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(label.toUpperCase(), x, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      const lines = doc.splitTextToSize(value || '\u2014', maxWidth);
      doc.text(lines, x, y + 4.5);

      return 4.5 + lines.length * 3.8;
    };

    // ── COVER PAGE ────────────────────────────────────────────────────────────
    // Navy banner
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 50, 'F');

    // Church name (white on navy)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...WHITE);
    doc.text('Mar Thoma Church Of San Francisco', W / 2, 22, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Diocese of North America and Europe', W / 2, 34, { align: 'center' });

    // Logo (large, centred below banner)
    if (logoDataURL) {
      const logoX = (W - COVER_LOGO_W) / 2;
      doc.addImage(logoDataURL, 'PNG', logoX, 54, COVER_LOGO_W, COVER_LOGO_H);
    }

    // "Parish Registry" title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(34);
    doc.setTextColor(...DARK);
    doc.text('Parish Registry', W / 2, 112, { align: 'center' });

    // Accent rule
    doc.setFillColor(...BLUE);
    doc.rect(W / 2 - 36, 117, 72, 1.2, 'F');

    // Metadata
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(`Generated: ${today}`, W / 2, 130, { align: 'center' });
    doc.text(`Total Registered Families: ${households.length}`, W / 2, 139, { align: 'center' });

    drawFooter(1);

    // ── FAMILY PAGES ──────────────────────────────────────────────────────────
    households.forEach((hh, index) => {
      doc.addPage();
      const pageNum = index + 2;

      drawPageHeader();

      // ── Family Name ──────────────────────────────────────────────────────
      const NAME_Y = HEADER_H + 9; // ~22
      const familyName =
        hh.mail_to ||
        `${hh.hh_first_name || ''} ${hh.hh_last_name || ''}`.trim() ||
        'Unknown Family';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.setTextColor(...DARK);
      doc.text(familyName, ML, NAME_Y);

      // Blue underline accent
      const nameW = Math.min(doc.getTextWidth(familyName), CW);
      doc.setFillColor(...BLUE);
      doc.rect(ML, NAME_Y + 2.5, nameW, 0.8, 'F');

      // ── Info Card: Address | Donor # | Prayer Group ──────────────────────
      const INFO_TOP = NAME_Y + 7;  // ~29
      const INFO_H   = 27;
      const INFO_BOT = INFO_TOP + INFO_H; // ~56
      const COL3W    = CW / 3;            // ~84.5 mm each
      const PAD      = 4;
      const FIELD_W  = COL3W - PAD * 2;

      // Card background + border
      doc.setFillColor(...LIGHT);
      doc.roundedRect(ML, INFO_TOP, CW, INFO_H, 2, 2, 'F');
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.25);
      doc.roundedRect(ML, INFO_TOP, CW, INFO_H, 2, 2, 'S');

      // Vertical dividers
      doc.line(ML + COL3W,     INFO_TOP + 3, ML + COL3W,     INFO_BOT - 3);
      doc.line(ML + COL3W * 2, INFO_TOP + 3, ML + COL3W * 2, INFO_BOT - 3);

      // Field values
      const addrParts = [hh.address_1, hh.address_2].filter(Boolean);
      const cityLine  = [hh.city, hh.state, hh.zip].filter(Boolean).join(', ');
      if (cityLine) addrParts.push(cityLine);
      const address     = addrParts.join('\n') || '—';
      const donorNum    = hh.envelope_number || '—';
      const prayerGroup = hh.prayer_group    || 'Unassigned';

      const FIELD_Y = INFO_TOP + 6;
      drawField('Address',      address,      ML + PAD,               FIELD_Y, FIELD_W);
      drawField('Donor #',      donorNum,     ML + COL3W + PAD,       FIELD_Y, FIELD_W);
      drawField('Prayer Group', prayerGroup,  ML + COL3W * 2 + PAD,  FIELD_Y, FIELD_W);

      // ── Members Table ────────────────────────────────────────────────────
      const TABLE_LABEL_Y = INFO_BOT + 7;  // ~63
      const TABLE_START_Y = TABLE_LABEL_Y + 4; // ~67

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text('FAMILY MEMBERS', ML, TABLE_LABEL_Y);

      // Format a stored date string (YYYY-MM-DD or similar) → DD MMM YYYY
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const fmtDate = (raw) => {
        if (!raw) return '—';
        const d = new Date(raw + 'T00:00:00'); // force local midnight parse
        if (isNaN(d)) return raw;
        const day   = String(d.getDate()).padStart(2, '0');
        const month = MONTHS[d.getMonth()];
        const year  = d.getFullYear();
        return `${day} ${month} ${year}`;
      };

      // Build rows — phone + email come from individual members
      const memberRows = (hh.members || []).map(m => [
        `${m.first_name || ''} ${m.last_name || ''}`.trim() || '—',
        m.relationship   || '—',
        fmtDate(m.birth_date),
        fmtDate(m.marriage_date),
        m.mobile_phone   || m.home_phone || '—',
        m.personal_email || '—',
      ]);

      // Column widths — must total CW (253.4 mm)
      // Name(55) + Rel(32) + DOB(27) + MarDate(27) + Phone(38) + Email(rest)
      const nameW2    = 55;
      const relW      = 32;  // widened from 24 → fits "Daughter-In-Law" on one line
      const dobW      = 27;
      const marW      = 27;
      const phoneW    = 38;
      const emailW    = CW - nameW2 - relW - dobW - marW - phoneW; // 74.4

      autoTable(doc, {
        startY:     TABLE_START_Y,
        head:       [['Member Name', 'Relationship', 'Date of Birth', 'Marriage Date', 'Phone', 'Email']],
        body:       memberRows.length ? memberRows : [['—', '—', '—', '—', '—', '—']],
        margin:     { left: ML, right: MR },
        tableWidth: CW,
        styles: {
          fontSize:    8,
          cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
          textColor:   DARK,
          lineColor:   BORDER,
          lineWidth:   0.2,
          font:        'helvetica',
          overflow:    'linebreak',
        },
        headStyles: {
          fillColor: NAVY,
          textColor: WHITE,
          fontStyle: 'bold',
          fontSize:  7.5,
        },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: nameW2  },
          1: { cellWidth: relW    },
          2: { cellWidth: dobW    },
          3: { cellWidth: marW    },
          4: { cellWidth: phoneW  },
          5: { cellWidth: emailW  },
        },
        theme: 'grid',
      });

      drawFooter(pageNum);
    });

    // ── Save ─────────────────────────────────────────────────────────────────
    doc.save(`Parish_Registry_${new Date().toISOString().slice(0, 10)}.pdf`);

  } catch (err) {
    console.error('PDF generation error:', err);
    alert('Failed to generate PDF: ' + err.message);
  } finally {
    if (setGenerating) setGenerating(false);
  }
}
