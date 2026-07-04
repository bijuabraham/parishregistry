@AGENTS.md

## Known Issues to Fix Later

### Top Donors Card Overlapping Issue (Priority: High)

**Problem**: In the Financial tab, the "Top Donors" card is overlapping with the "Giving by Prayer Group" card above it. The DOM structure is correct but cards are not properly separated in the grid layout.

**Location**: `/app/page.js` - Financial visualizations section around lines 1725-1850

**What was tried**:
1. Added fixed heights to dashboard-card (350px regular, 450px for span 2)
2. Added flexbox layout with flex-direction: column
3. Added overflow: hidden to cards
4. Set card-title-container to fixed height (60px)
5. Set chart-container to use calc(100% - 70px) to fill remaining space
6. Used grid with align-items: start
7. Made Top Donors card span full width (gridColumn: 'span 2')

**Files modified**:
- `/app/globals.css` - Added CSS rules for #financial-visualizations-section
- `/app/page.js` - Added fixed heights and gridColumn style to Top Donors card

**Root cause**: Likely CSS Grid behavior where cards in the same row don't have equal heights. The content in one card expands and overlaps with the card below.

**Suggested fixes to try**:
1. Check if there's a parent container with position: relative causing issues
2. Try using `align-items: stretch` on the grid instead of `align-items: start`
3. Add explicit `position: relative` and `z-index` to cards
4. Check if the flexbox on dashboard-card is interfering with grid layout
5. Try removing the flex display from .dashboard-card in financial section
6. Consider using CSS Grid's `grid-auto-rows` to enforce row heights

### Financial Data Top Donors Filtering (Completed)

The Top Donors filtering by year is working correctly. The data filtering was fixed to:
- Use `useMemo` hook for proper recalculation on year change
- Convert donor_number to String for proper comparison
- Filter all contributions (not just recent 50)

The data is correct - the issue is purely CSS/layout now.
