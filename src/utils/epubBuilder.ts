import JSZip from 'jszip';

export interface EpubChapter {
  title: string;
  originalText: string;
  translatedText: string;
}

export interface EpubBookConfig {
  title: string;
  author: string;
  publisher: string;
  contact: string;
  chapters: EpubChapter[];
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textToXhtmlParagraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('\n');
}

export async function buildEpub(config: EpubBookConfig): Promise<Blob> {
  const zip = new JSZip();
  const uuid = generateUUID();
  const modifiedTime = new Date().toISOString().split('.')[0] + 'Z';

  // 1. mimetype (MUST be first file, uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);

  // 3. OEBPS/css/style.css (Clean typography layout)
  const stylesheet = `body {
  font-family: "Georgia", "Times New Roman", serif;
  margin: 8%;
  line-height: 1.7;
  color: #111111;
  background-color: #ffffff;
}
h1, h2, h3 {
  font-family: "Helvetica Neue", "Arial", sans-serif;
  text-align: center;
  color: #222222;
  margin-top: 1.8em;
  margin-bottom: 1em;
}
p {
  text-indent: 1.5em;
  margin: 0 0 0.9em 0;
  text-align: justify;
}
p:first-of-type {
  text-indent: 0;
}
.cover-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 80vh;
  text-align: center;
  padding: 3em 1em;
}
.cover-title {
  font-size: 2.5em;
  font-weight: bold;
  margin-top: 2em;
  margin-bottom: 0.5em;
  color: #111111;
}
.cover-author {
  font-size: 1.5em;
  margin-bottom: 4em;
  color: #555555;
}
.cover-publisher {
  font-size: 1.1em;
  font-weight: bold;
  margin-top: auto;
  color: #333333;
}
.cover-contact {
  font-size: 0.9em;
  color: #666666;
  margin-top: 0.5em;
}
`;
  zip.file('OEBPS/css/style.css', stylesheet);

  // 4. OEBPS/xhtml/cover.xhtml (Text Cover Page)
  const coverXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <title>Cover</title>
  <link rel="stylesheet" type="text/css" href="../css/style.css"/>
</head>
<body>
  <div class="cover-container">
    <h1 class="cover-title">${escapeHtml(config.title)}</h1>
    <div class="cover-author">By ${escapeHtml(config.author)}</div>
    <div class="cover-publisher">${escapeHtml(config.publisher)}</div>
    <div class="cover-contact">${escapeHtml(config.contact)}</div>
  </div>
</body>
</html>`;
  zip.file('OEBPS/xhtml/cover.xhtml', coverXhtml);

  // 5. Generate chapters
  config.chapters.forEach((chapter, index) => {
    const chapterId = index + 1;
    const chapterXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <title>${escapeHtml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="../css/style.css"/>
</head>
<body>
  <h2>${escapeHtml(chapter.title)}</h2>
  <div class="chapter-content">
    ${textToXhtmlParagraphs(chapter.translatedText)}
  </div>
</body>
</html>`;
    zip.file(`OEBPS/xhtml/chapter_${chapterId}.xhtml`, chapterXhtml);
  });

  // 6. OEBPS/toc.ncx
  let navPoints = `    <navPoint id="navPoint-cover" playOrder="1">
      <navLabel>
        <text>Cover</text>
      </navLabel>
      <content src="xhtml/cover.xhtml"/>
    </navPoint>\n`;

  config.chapters.forEach((chapter, index) => {
    const chapterId = index + 1;
    navPoints += `    <navPoint id="navPoint-chapter-${chapterId}" playOrder="${chapterId + 1}">
      <navLabel>
        <text>${escapeHtml(chapter.title)}</text>
      </navLabel>
      <content src="xhtml/chapter_${chapterId}.xhtml"/>
    </navPoint>\n`;
  });

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeHtml(config.title)}</text>
  </docTitle>
  <navMap>
${navPoints}  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', tocNcx);

  // 7. OEBPS/content.opf
  let manifestItems = `    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="style" href="css/style.css" media-type="text/css"/>
    <item id="cover-xhtml" href="xhtml/cover.xhtml" media-type="application/xhtml+xml"/>\n`;

  config.chapters.forEach((chapter, index) => {
    const chapterId = index + 1;
    manifestItems += `    <item id="chapter_${chapterId}" href="xhtml/chapter_${chapterId}.xhtml" media-type="application/xhtml+xml"/>\n`;
  });

  let spineItems = `    <itemref idref="cover-xhtml"/>\n`;
  config.chapters.forEach((_, index) => {
    const chapterId = index + 1;
    spineItems += `    <itemref idref="chapter_${chapterId}"/>\n`;
  });

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeHtml(config.title)}</dc:title>
    <dc:creator id="creator">${escapeHtml(config.author)}</dc:creator>
    <dc:publisher>${escapeHtml(config.publisher)}</dc:publisher>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modifiedTime}</meta>
  </metadata>
  <manifest>
${manifestItems}  </manifest>
  <spine toc="toc">
${spineItems}  </spine>
</package>`;
  zip.file('OEBPS/content.opf', contentOpf);

  // Generate EPUB Blob
  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
  });
}
