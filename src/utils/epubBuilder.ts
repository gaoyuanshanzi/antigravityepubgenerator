import JSZip from 'jszip';

export interface EpubChapter {
  title: string;
  originalText: string;
  translatedText: string;
  illustrationBuffer?: ArrayBuffer; // Binary content of the illustration
}

export interface EpubBookConfig {
  title: string;
  author: string;
  publisher: string;
  contact: string;
  coverBuffer?: ArrayBuffer; // Binary content of the cover
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
  const modifiedTime = new Date().toISOString().split('.')[0] + 'Z'; // e.g. 2026-07-04T12:00:00Z

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

  // 3. OEBPS/css/style.css
  const stylesheet = `body {
  font-family: "Georgia", "Times New Roman", serif;
  margin: 5%;
  line-height: 1.6;
  color: #111111;
  background-color: #ffffff;
}
h1, h2, h3 {
  font-family: "Helvetica Neue", "Arial", sans-serif;
  text-align: center;
  color: #222222;
  margin-top: 1.5em;
  margin-bottom: 0.8em;
}
p {
  text-indent: 1.5em;
  margin: 0 0 0.8em 0;
  text-align: justify;
}
p:first-of-type {
  text-indent: 0;
}
.illustration-container {
  text-align: center;
  margin: 2em 0;
  page-break-inside: avoid;
}
.illustration {
  max-width: 100%;
  max-height: 600px;
  height: auto;
  border-radius: 6px;
}
.cover-container {
  text-align: center;
  padding: 2em 0;
}
.cover-title {
  font-size: 2.2em;
  font-weight: bold;
  margin-top: 1em;
  margin-bottom: 0.2em;
  color: #111111;
  text-align: center;
}
.cover-author {
  font-size: 1.4em;
  margin-bottom: 2em;
  color: #555555;
  text-align: center;
}
.cover-image-container {
  text-align: center;
  margin: 2em 0;
}
.cover-image {
  max-width: 80%;
  max-height: 500px;
  height: auto;
  border-radius: 8px;
}
.cover-publisher {
  font-size: 1.1em;
  font-weight: bold;
  margin-top: 3em;
  color: #333333;
  text-align: center;
}
.cover-contact {
  font-size: 0.9em;
  color: #666666;
  margin-top: 0.5em;
  text-align: center;
}
`;
  zip.file('OEBPS/css/style.css', stylesheet);

  // 4. OEBPS/xhtml/cover.xhtml
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
    ${config.coverBuffer ? `
    <div class="cover-image-container">
      <img class="cover-image" src="../images/cover.jpg" alt="Cover Image"/>
    </div>
    ` : ''}
    <div class="cover-publisher">${escapeHtml(config.publisher)}</div>
    <div class="cover-contact">${escapeHtml(config.contact)}</div>
  </div>
</body>
</html>`;
  zip.file('OEBPS/xhtml/cover.xhtml', coverXhtml);

  // Save cover image if exists
  if (config.coverBuffer) {
    zip.file('OEBPS/images/cover.jpg', config.coverBuffer);
  }

  // 5. Generate chapters
  config.chapters.forEach((chapter, index) => {
    const chapterId = index + 1;
    const hasIllustration = !!chapter.illustrationBuffer;
    const chapterXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <title>${escapeHtml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="../css/style.css"/>
</head>
<body>
  <h2>${escapeHtml(chapter.title)}</h2>
  ${hasIllustration ? `
  <div class="illustration-container">
    <img class="illustration" src="../images/chapter_${chapterId}.jpg" alt="Illustration for ${escapeHtml(chapter.title)}"/>
  </div>
  ` : ''}
  <div class="chapter-content">
    ${textToXhtmlParagraphs(chapter.translatedText)}
  </div>
</body>
</html>`;
    zip.file(`OEBPS/xhtml/chapter_${chapterId}.xhtml`, chapterXhtml);

    if (chapter.illustrationBuffer) {
      zip.file(`OEBPS/images/chapter_${chapterId}.jpg`, chapter.illustrationBuffer);
    }
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

  if (config.coverBuffer) {
    manifestItems += `    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>\n`;
  }

  config.chapters.forEach((chapter, index) => {
    const chapterId = index + 1;
    manifestItems += `    <item id="chapter_${chapterId}" href="xhtml/chapter_${chapterId}.xhtml" media-type="application/xhtml+xml"/>\n`;
    if (chapter.illustrationBuffer) {
      manifestItems += `    <item id="image_${chapterId}" href="images/chapter_${chapterId}.jpg" media-type="image/jpeg"/>\n`;
    }
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
    ${config.coverBuffer ? '<meta name="cover" content="cover-image"/>' : ''}
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
