const XLSX = require("xlsx");

const addresses = `30 Macedon St HOPPERS CROSSING VIC 3029 Australia
250 Hall Rd YANNATHAN VIC 3981 Australia
12 Mullock Rd DIGGERS REST VIC 3427 Australia
242 Ormond Rd NARRE WARREN SOUTH VIC 3805 Australia
5 Campbell St LAVERTON VIC 3028 Australia
82 Cambridge Rd KILSYTH VIC 3137 Australia
34 Brooksby Cct HARKNESS VIC 3337 Australia
69 Bona Vista Rd BAYSWATER VIC 3153 Australia
2 Wallace Cres BEAUMARIS VIC 3193 Australia
8 Eugenia Ct BORONIA VIC 3155 Australia
4 Trina Ct KEYSBOROUGH VIC 3173 Australia
14 Roebourne Cres CAMPBELLFIELD VIC 3061 Australia
506 Gregory St SOLDIERS HILL VIC 3350 Australia
25 Highland Cres MOOROOLBARK VIC 3138 Australia
13 Larne Ave BAYSWATER VIC 3153 Australia
5 LOUIS RISE KILMORE EAST VIC 3764 Australia
11 Chris Ct KEYSBOROUGH VIC 3173 Australia
4 Shalimar Cres BORONIA VIC 3155 Australia
19 Hunt Dr SEAFORD VIC 3198 Australia
65 Hadley St SEAFORD VIC 3198 Australia
51 Laurina Cres FRANKSTON NORTH VIC 3200 Australia
6 Innkeeper Pl SYDENHAM VIC 3037 Australia
24 Olive Gr BORONIA VIC 3155 Australia
15 Poplar St FRANKSTON NORTH VIC 3200 Australia
15 Leisureland Dr LANGWARRIN VIC 3910 Australia
11 Warrington Cl NARRE WARREN VIC 3805 Australia
52 Clarendon St THORNBURY VIC 3071 Australia
16 Cyprus Ave NUNAWADING VIC 3131 Australia
27 Widdop Cres HAMPTON EAST VIC 3188 Australia
3 Cardiff St BORONIA VIC 3155 Australia
3 Kintore Cres BOX HILL VIC 3128 Australia
51 Donald St S ALTONA MEADOWS VIC 3028 Australia
8 Paruna Pl HOPPERS CROSSING VIC 3029 Australia
6 Camelot Dr SPRINGVALE SOUTH VIC 3172 Australia
55 Bennett St FOREST HILL VIC 3131 Australia
392 Boronia Rd BORONIA VIC 3155 Australia
17 Mahogany Ave FRANKSTON NORTH VIC 3200 Australia
11 Bedford St BOX HILL VIC 3128 Australia
14 Westerfield Dr NOTTING HILL VIC 3168 Australia
196 McGrath Rd WYNDHAM VALE VIC 3024 Australia
9 Leawarra Pde FRANKSTON VIC 3199 Australia
20 Trinian St VERMONT VIC 3133 Australia
83 Moore Ave MONTROSE VIC 3765 Australia
28 Inkerman St NEWINGTON VIC 3350 Australia
7 Lowe Cres SUNSHINE VIC 3020 Australia
35 Gardiner Rd SEVILLE VIC 3139 Australia
60 O'Connor Rd KNOXFIELD VIC 3180 Australia
6 Taranto Dr NOBLE PARK VIC 3174 Australia
6 Brimpton Gr WYNDHAM VALE VIC 3024 Australia
195 Dandelion Dr ROWVILLE VIC 3178 Australia
23 Stuart St THE BASIN VIC 3154 Australia
38 Park Hill Dr RINGWOOD NORTH VIC 3134 Australia
20 Robertson Cres BORONIA VIC 3155 Australia
175 Sheffield Rd KILSYTH VIC 3137 Australia
14 Station Ave EMERALD VIC 3782 Australia
394 Boronia Rd BORONIA VIC 3155 Australia
25 Squires Rd TEESDALE VIC 3328 Australia
41 Arthur St BURWOOD VIC 3125 Australia
6 Lansor St SPRINGVALE SOUTH VIC 3172 Australia
27 Tennyson St NORLANE VIC 3214 Australia
21 Wilkinson Ct ROXBURGH PARK VIC 3064 Australia
24 Kendall St RINGWOOD VIC 3134 Australia
919 Mountain Hwy BAYSWATER VIC 3153 Australia
7 Rotherwood Ave RINGWOOD EAST VIC 3135 Australia
3 NURSERY RISE WARRAGUL VIC 3820 Australia
U 2 22 Fellmongers Rd BREAKWATER VIC 3219 Australia
10 Deutscher St AVONDALE HEIGHTS VIC 3034 Australia
9 Beverley Pl KEYSBOROUGH VIC 3173 Australia
2 Sherwood St BIRCHIP VIC 3483 Australia
43 Peppertree Hill Rd LONGFORD VIC 3851 Australia
11 Berry Ct LILYDALE VIC 3140 Australia
14 Queenstown Rd BORONIA VIC 3155 Australia
4c Butterworth St CASTLEMAINE VIC 3450 Australia
97 Baden Powell Dr MOUNT ELIZA VIC 3930 Australia
31 Glenwood Dr SPRINGVALE SOUTH VIC 3172 Australia
107 Disney St CRIB POINT VIC 3919 Australia
4 Columbia Cl TULLAMARINE VIC 3043 Australia
56 Van Ness Ave MORNINGTON VIC 3931 Australia
93 Condon St KENNINGTON VIC 3550 Australia
18 Luntar Rd OAKLEIGH SOUTH VIC 3167 Australia
74 Taldra Dr FERNTREE GULLY VIC 3156 Australia`
  .trim()
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

const header = [
  "Address (supplied)",
  "Client Name",
  "Deposit Amount",
  "Contract Amount",
  "Project Date",
];

const rows = [header, ...addresses.map((a) => [a, "", "", "", ""])];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
ws["!cols"] = [{ wch: 55 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
XLSX.utils.book_append_sheet(wb, ws, "Projects");

const out = "C:/SGF/Project_List_Populated.xlsx";
XLSX.writeFile(wb, out);
console.log(`Wrote ${addresses.length} addresses to ${out}`);
