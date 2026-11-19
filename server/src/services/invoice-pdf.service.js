import PDFDocument from 'pdfkit';

const money = (value, currency) => `${currency} ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function createInvoicePdf({ invoice, employee, organization }) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${invoice.id} - ${organization.name}`, Author: organization.name } });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      const currency = invoice.currency ?? 'USD';
      const width = document.page.width - 96;
      const lineItems = invoice.lineItems?.length ? invoice.lineItems : [{ description: `Monthly services - ${invoice.month}`, quantity: 1, unitRate: invoice.amount, amount: invoice.amount }];
      const ensureRoom = (height) => { if (document.y + height > document.page.height - 65) document.addPage(); };
      document.font('Helvetica-Bold').fontSize(21).fillColor('#6d3fc8').text('INVOICE');
      document.fontSize(11).fillColor('#161b24').text(invoice.id).moveDown(0.3);
      document.font('Helvetica').fontSize(10).text(`Status: ${invoice.status}`).text(`Period: ${invoice.month}`);
      document.text(`Prepared: ${(invoice.createdAt ?? invoice.submittedAt ?? '').slice(0, 10)}`);
      if (invoice.dueDate) document.text(`Due date: ${invoice.dueDate}`);
      document.moveDown().font('Helvetica-Bold').text('BILL TO').font('Helvetica').text(organization.name);
      document.moveDown().font('Helvetica-Bold').text('PREPARED BY').font('Helvetica');
      document.text(employee.name).text(employee.email).text(`${employee.title} | ${employee.department}`).moveDown(1.5);
      const tableHeader = () => {
        const y = document.y;
        document.fillColor('#f0eafb').rect(48, y, width, 25).fill();
        document.fillColor('#161b24').font('Helvetica-Bold').fontSize(9);
        document.text('DESCRIPTION', 56, y + 8, { width: 245 });
        document.text('QTY', 310, y + 8, { width: 35, align: 'right' });
        document.text('RATE', 355, y + 8, { width: 80, align: 'right' });
        document.text('AMOUNT', 445, y + 8, { width: 92, align: 'right' });
        document.x = 48;
        document.y = y + 33;
        document.font('Helvetica');
      };
      tableHeader();
      for (const item of lineItems) {
        document.font('Helvetica').fontSize(10);
        const height = Math.max(30, document.heightOfString(item.description, { width: 245 }) + 14);
        if (document.y + height > document.page.height - 65) { document.addPage(); tableHeader(); }
        const y = document.y;
        document.text(item.description, 56, y, { width: 245 });
        document.text(String(item.quantity), 310, y, { width: 35, align: 'right' });
        document.text(Number(item.unitRate).toFixed(2), 355, y, { width: 80, align: 'right' });
        document.text(Number(item.amount).toFixed(2), 445, y, { width: 92, align: 'right' });
        document.strokeColor('#e7e5ef').moveTo(48, y + height - 5).lineTo(48 + width, y + height - 5).stroke();
        document.x = 48;
        document.y = y + height;
      }
      ensureRoom(100);
      document.moveDown().fontSize(10).text(`Subtotal: ${money(invoice.subtotal ?? invoice.amount, currency)}`, { align: 'right' });
      document.text(`Tax (${invoice.taxRate ?? 0}%): ${money(invoice.taxAmount ?? 0, currency)}`, { align: 'right' });
      document.moveDown(0.4).font('Helvetica-Bold').fontSize(14).fillColor('#6d3fc8').text(`TOTAL: ${money(invoice.amount, currency)}`, { align: 'right' });
      document.fillColor('#161b24').fontSize(10).font('Helvetica');
      for (const [label, value] of [['Payment details', invoice.paymentDetails], ['Notes', invoice.notes]]) {
        if (!value) continue;
        ensureRoom(60);
        document.moveDown().font('Helvetica-Bold').text(label).font('Helvetica').text(value, { width });
      }
      document.end();
    } catch (error) { document.destroy(); reject(error); }
  });
}
