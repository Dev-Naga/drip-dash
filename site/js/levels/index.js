// Level registry — the campaign runs in this order. To add a seasonal or monthly
// challenge level, create a new file that exports a level definition and add it here.
import l1 from './l1-wake.js';
import l2 from './l2-pressure.js';
import l3 from './l3-sunrise.js';
import l4 from './l4-storm.js';
import l5 from './l5-tower.js';
import l6 from './l6-show.js';
import l7 from './l7-rush.js';

export const LEVELS = [l1, l2, l3, l4, l5, l6, l7];
