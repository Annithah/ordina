const assert = require('node:assert/strict');
const { test } = require('node:test');

const { createFileLimiter, detect, filesFromBody, prepareFiles } = require('../src/lib/media');

const b64 = (buffer) => Buffer.from(buffer).toString('base64');

test('files are recognised by content, not by name', () => {
  assert.equal(detect(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'x.pdf').mimeType, 'image/jpeg');
  assert.equal(detect(Buffer.from('%PDF-1.7\n'), 'a.txt').kind, 'pdf');
  assert.equal(detect(Buffer.from('date,task\n2026-10-22,Exam'), 'list.csv').mimeType, 'text/csv');
  assert.equal(detect(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'homework.pdf'), null);
  // A ZIP without word/ inside is not a Word document.
  assert.equal(detect(Buffer.from('PK\x03\x04 not a document'), 'plan.docx'), null);
});

test('text files are sent as text; images inline', async () => {
  const { parts, kinds } = await prepareFiles([
    { data: b64('Buy milk\nCall mom at 6'), name: 'todo.txt' },
    { data: b64(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), name: 'board.png' },
  ]);
  assert.deepEqual(kinds, ['text', 'image']);
  assert.match(parts[0].text, /Call mom at 6/);
  assert.equal(parts[1].inlineData.mimeType, 'image/png');
});

test('friendly errors: too many, unsupported, empty text', async () => {
  const text = { data: b64('hello'), name: 'a.txt' };
  await assert.rejects(prepareFiles(new Array(6).fill(text)), { code: 'FILE_TOO_MANY' });
  await assert.rejects(prepareFiles([{ data: b64(Buffer.from([0, 1, 2, 3, 4])), name: 'a.bin' }]), { code: 'FILE_UNSUPPORTED' });
  await assert.rejects(prepareFiles([{ data: b64('   '), name: 'empty.txt' }]), { code: 'FILE_UNREADABLE' });
  await assert.rejects(prepareFiles([]), { code: 'FILE_MISSING' });
});

test('older single-file requests still work', () => {
  assert.equal(filesFromBody({ media: 'abc', fileName: 'x.jpg' }).length, 1);
  assert.equal(filesFromBody({ files: [{ data: 'a' }, { data: 'b' }] }).length, 2);
  assert.deepEqual(filesFromBody({}), []);
});

test('each file counts towards the per-user AI limit', () => {
  const consume = createFileLimiter({ max: 5, windowMs: 1000 });
  assert.equal(consume(1, 3, 0), true);
  assert.equal(consume(1, 3, 10), false);
  assert.equal(consume(2, 5, 10), true);
  assert.equal(consume(1, 3, 2000), true);
});

test('Word documents: the text is extracted on the server', async () => {
  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Submit project report by Friday</w:t></w:r></w:p></w:body></w:document>');
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const { parts, kinds } = await prepareFiles([{ data: buffer.toString('base64'), name: 'plan.docx' }]);
  assert.deepEqual(kinds, ['docx']);
  assert.match(parts[0].text, /Submit project report by Friday/);
});
