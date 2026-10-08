/**
 * Builds the seven-page SGF Central management showcase.
 * Screenshots were captured from the running application. Customer details are masked.
 */
const fs = require("fs");
const path = require("path");
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} = require("docx");

const ROOT = __dirname;
const SHOTS = path.join(ROOT, "screenshots");
const DOCX = path.join(ROOT, "SGF_Central_Management_Showcase.docx");

/**
 * A4 portrait, 10mm margin. Image sizes are CSS pixels at 96dpi.
 * Each grab is scaled to the content box and is never cropped.
 */
const MM = 10;
const A4 = { width: 11906, height: 16838 };
const MARGIN = Math.round((MM / 25.4) * 1440);
const CONTENT_W = Math.floor((A4.width - MARGIN * 2) / 15) - 4;
const CONTENT_H = Math.floor((A4.height - MARGIN * 2) / 15) - 36;

const INK = "323233";
const BLUE = "4D93D9";
const MUTED = "5C6570";
const RULE = "D5D8DC";

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function fit(file, maxW, maxH) {
  const size = pngSize(file);
  const scale = Math.min(maxW / size.width, maxH / size.height);
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

function picture(file, maxW, maxH) {
  const box = fit(file, maxW, maxH);
  return new ImageRun({
    type: "png",
    data: fs.readFileSync(file),
    transformation: box,
    altText: { title: "SGF Central screen", description: "Screenshot from SGF Central", name: path.basename(file) },
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: opts.before ?? 60, after: opts.after ?? 60, line: 240 },
    alignment: opts.align,
    children: [
      new TextRun({
        text,
        font: "Calibri",
        size: opts.size ?? 21,
        bold: !!opts.bold,
        italics: !!opts.italics,
        color: opts.color ?? INK,
      }),
    ],
  });
}

function rich(runs, opts = {}) {
  return new Paragraph({
    spacing: { before: opts.before ?? 60, after: opts.after ?? 60, line: 240 },
    children: runs.map((run) => new TextRun({ font: "Calibri", size: 21, color: INK, ...run })),
  });
}

function title(text) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BLUE, space: 4 } },
    children: [new TextRun({ text, font: "Calibri", size: 36, bold: true, color: INK })],
  });
}

function caption(text) {
  return p(text, { size: 16, italics: true, color: MUTED, before: 20, after: 40 });
}

function benefit(text) {
  return new Paragraph({
    spacing: { before: 80, after: 40 },
    shading: { type: "clear", fill: "E8F2FB" },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: BLUE, space: 6 } },
    children: [
      new TextRun({ text: "In practice.  ", font: "Calibri", size: 21, bold: true, color: BLUE }),
      new TextRun({ text, font: "Calibri", size: 21, color: INK }),
    ],
  });
}

function shot(file, note) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 0 },
      keepNext: true,
      children: [picture(file, CONTENT_W, CONTENT_H)],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 20, after: 40, line: 220 },
      children: [
        new TextRun({ text: note, font: "Calibri", size: 16, italics: true, color: MUTED }),
      ],
    }),
  ];
}

function bullet(text) {
  return new Paragraph({
    spacing: { before: 20, after: 20, line: 230 },
    children: [
      new TextRun({ text: "•  ", font: "Calibri", size: 21, bold: true, color: BLUE }),
      new TextRun({ text, font: "Calibri", size: 21, color: INK }),
    ],
  });
}

function header() {
  const logo = path.join(ROOT, "logo.png");
  const logoBox = fit(logo, 22, 22);
  return new Header({
    children: [
      new Paragraph({
        spacing: { after: 40 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 1 } },
        children: [
          new ImageRun({
            type: "png",
            data: fs.readFileSync(logo),
            transformation: logoBox,
            altText: { title: "SGF", description: "Superior Granny Flats logo", name: "logo" },
          }),
          new TextRun({ text: "   SGF Central", font: "Calibri", size: 20, bold: true, color: INK }),
          new TextRun({ text: "    Management information addendum", font: "Calibri", size: 18, color: MUTED }),
        ],
      }),
    ],
  });
}

function footer() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { top: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 6 } },
        spacing: { before: 60 },
        children: [
          new TextRun({ text: "Superior Granny Flats    ", font: "Calibri", size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 16, color: INK }),
          new TextRun({ text: "  /  ", font: "Calibri", size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Calibri", size: 16, color: INK }),
        ],
      }),
    ],
  });
}

function screen(name) {
  return path.join(SHOTS, name);
}

async function main() {
  const projects = screen("01-projects.png");
  const quotes = screen("02-quotes.png");
  const callbacks = screen("03-callbacks.png");
  const hotlist = screen("04-hotlist.png");
  const status = screen("05-status-manager.png");
  const overview = screen("16-overview.png");
  const drawingMgr = screen("06-drawing-manager.png");
  const drawings = screen("07-drawings.png");
  const payments = screen("10-payments.png");
  const sales = screen("11-sales-totals.png");
  const analytics = screen("12-sales-analytics.png");
  const colours = screen("14-colour-manager.png");

  const masked = "Customer names, addresses and contact details are masked.";

  const children = [
    title("SGF Central — Integrated Business Management"),
    p("SGF Central is the management platform built for Superior Granny Flats. Staff use it to run the business in Victoria and Queensland, from the first quotation through to a completed project."),
    p("Each job is one record. It moves from Quotes and the Hot List into Pre-Engagement, Design, Permit, Ready to Build and Construction, and then to Complete. On Hold and Archive sit beside that path. Sales, administration, design and construction work from the same record."),
    ...shot(projects, `The Design stage. The menu shows the live count at each stage. ${masked}`),
    benefit("Management can see the whole book of work in one place, with the same stages in both states."),

    title("Managing Enquiries and Converting Sales"),
    p("Quotations are listed with the date they were added, the state, and whether the enquiry is still active. Each quote shows four follow-up reminders. The first is due 24 hours after the quote is added and is checked every hour, Melbourne time. Later reminders, and the call-back lists, run from the same schedule."),
    p("Call-back lists gather the quotes that still need a call, by day and by state. A quote can be placed on the Hot List when it becomes a live prospect. That list separates prospective work for Victoria, Queensland and the other sales streams. A sale then opens as a project."),
    rich([
      { text: "Quotations and sales are both recorded. ", bold: false },
      { text: "SGF Central does not calculate a quotation-to-sale conversion rate.", bold: true },
    ]),
    ...shot(quotes, "Quotes, with reminder columns 1 to 4. Details masked."),
    ...shot(callbacks, "Call-back lists by day and state. Details masked."),
    benefit("Follow-up is scheduled and visible, so enquiries are less likely to be left unattended."),

    title("Managing Projects from Sale to Completion"),
    p("Once a project is sold, its status is Pre-Engagement Phase, Design Phase, Permit Phase, Ready to Build, Construction Phase or Complete. It can also be placed On Hold."),
    p("Status Manager lists the jobs in the stage selected and the requirements on each one: deposit, concept drawings, working drawings, site visit, colours, windows, contract, survey and soils, town planning, BAL, energy report, footing certification, building permit and sewer connection. Green is done, amber is under way, and red still needs attention. Opening the project shows which item is next."),
    p("Town planning and the building permit are tracked on the project. They are not separate stages in the main menu."),
    p("Opening a project on Overview shows that job on its own: each requirement, whether it is done, under way or still to do, and the list of what to work on next."),
    ...shot(status, `Status Manager for the Design stage. ${masked}`),
    ...shot(overview, "The project Overview. The whole status of the job is on one screen. The project is masked."),
    benefit("Management can see what is holding a job up, and which part of the business needs to act."),

    title("Coordinating the Design and Approval Process"),
    p("Drawing Manager groups current design work into Pre-Engagement, Concept, working drawings and Permit. Each row shows the revision count, how long the drawings have been under way, the draftsperson, and whether the set is with the client, the sales team or the design team. Staff can email the client from the list."),
    p("On the project, drawings are uploaded, revised and approved. Approving the concept moves the job on to working drawings. Approving the working drawings marks the set complete. The status on the project is Not Assigned, Concept Stage, Working Drawing Stage or Drawings Complete. Clients can also be sent a page on which to approve the concept."),
    ...shot(drawingMgr, "Concept work in Drawing Manager. Names masked."),
    ...shot(drawings, "Concept Stage, with the revision and the approval actions."),
    benefit("Design, revisions and approvals are visible together, including which jobs are still in concept."),

    title("Coordinating Clients, Selections and Project Requirements"),
    p("Colour selections are tracked as Not Sent, Sent or Complete. The colour screen covers external finishes and the internal areas: flooring, kitchen, bathroom and bedrooms. Staff can email the client a colours link. A client page is also available for those selections, and another for approving concept drawings."),
    p("The planning screen records town planning, BAL, sewer connection, soil test, energy report, footing certification, building permit and site survey. Soil tests and site surveys are marked Not Booked, Booked or Complete. That is a status of the third-party work, not a separate appointment diary. Jobs still needing a site visit are listed on their own board."),
    p("The payment screen calculates the deposit and the construction stages from the project cost: Base, Frame, Lock Up, Fix and Final. Each line shows its share of the price and can be marked paid. This is the project payment checklist. It is not the accounting ledger."),
    ...shot(colours, "Colour Manager across current jobs. Names masked."),
    ...shot(payments, "Deposit and construction stages. The project is masked."),
    benefit("Selections, approval items and stage payments stay on the project, so outstanding work is visible before the job moves on."),

    title("Sales Performance, Analytics and Forecasting"),
    p("Sales Totals shows the number of sales and the contracted project value for the selected year, by stream and by state, together with the average price. The same area opens a financial-year view, the monthly lists, salesperson figures and a PDF."),
    rich([
      { text: "The Projected figures extend year-to-date contracted sales across the rest of the year, in proportion to how much of the year has passed. " },
      { text: "They are a projection of contracted sales, not revenue recognised in the accounts.", bold: true },
    ]),
    p("Sales Analytics charts monthly sales for Victoria, Queensland and the other streams. Last year can be outlined on the same chart, and an average line can be drawn through the current year. Management can enter monthly job-count targets and compare cumulative sales with that plan. Those targets are planning figures on the analytics screen. They are separate from the contract values on each project. The chart below shows recorded sales and last year, not a target line."),
    ...shot(sales, "Sales Totals for the 2026 calendar year. Projected figures follow the year-to-date pace."),
    ...shot(analytics, "Monthly sales for 2026, with last year outlined and the current average marked."),
    benefit("Management can see volume, value, the mix between the states, and the pace of the year, when planning workload and capacity."),

    title("Supporting an Efficient and Scalable Business"),
    p("Taken together, SGF Central is how management sees the pipeline, the sales result and the work still to be done."),
    bullet("Centralised records. Project and sales information for Victoria and Queensland is held on one platform."),
    bullet("A consistent process. Quotes, design, approvals, construction and completion follow the same stages."),
    bullet("Operational visibility. The stage boards and Status Manager show what is finished and what is not."),
    bullet("Sales follow-up. Reminders and call-back lists show which enquiries still need a call."),
    bullet("Less duplicated administration. Drawings, colours, surveys and stage payments are recorded on the project."),
    bullet("Decisions from the sales record. Volumes, contract values, averages and the year-to-date pace are available without rebuilding them in a spreadsheet."),
    bullet("Room to grow. The same stages and the state split can carry a larger book of work, including further streams."),
    ...shot(hotlist, "The Hot List: prospective work already separated for Victoria, Queensland and the other streams."),
    p("SGF Central is an important part of Superior Granny Flats' operational infrastructure. By integrating sales management, project workflows, customer communication and business reporting, the platform supports consistent processes, management oversight and the continued growth of the business.", { before: 80 }),
  ];

  const doc = new Document({
    creator: "Superior Granny Flats",
    title: "SGF Central — Management Showcase",
    description: "Addendum to the management information report.",
    styles: {
      default: {
        document: {
          styles: [
            {
              id: "Normal",
              run: { font: "Calibri", size: 21, color: INK },
              paragraph: { spacing: { line: 240 } },
            },
          ],
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4.width, height: A4.height },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 180, footer: 140 },
          },
        },
        headers: { default: header() },
        footers: { default: footer() },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(DOCX, buffer);
  console.log(DOCX);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
