import type { Profile, TailoredCv } from './types.ts';

function encodePdfWinAnsiString(input: string): string {
  const sanitized = input
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, '-');

  let out = '';
  for (let i = 0; i < sanitized.length; i++) {
    const code = sanitized.charCodeAt(i);
    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      out += '\\' + sanitized[i];
    } else if (code >= 32 && code <= 126) {
      out += sanitized[i];
    } else if (code >= 160 && code <= 255) {
      out += '\\' + code.toString(8).padStart(3, '0');
    } else {
      out += ' ';
    }
  }
  return out;
}

function wrapText(text: string, maxChars = 88): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface PdfLine {
  text: string;
  font: 'F1' | 'F2';
  size: number;
  spacingBefore?: number;
}

export function generateAtsPdfBuffer(cv: TailoredCv, profile: Profile): Buffer {
  const isEn = cv.language === 'en';
  const lines: PdfLine[] = [];

  lines.push({ text: profile.name.toUpperCase(), font: 'F2', size: 15, spacingBefore: 0 });
  lines.push({
    text: isEn ? profile.titleEn : profile.titlePt,
    font: 'F2',
    size: 11,
    spacingBefore: 4
  });
  lines.push({
    text: `${isEn ? profile.locationEn : profile.locationPt} | ${profile.email} | ${profile.phone}`,
    font: 'F1',
    size: 9,
    spacingBefore: 3
  });
  lines.push({
    text: `${profile.linkedin} | ${profile.github}`,
    font: 'F1',
    size: 9,
    spacingBefore: 2
  });

  // Summary section
  lines.push({
    text: isEn ? 'PROFESSIONAL SUMMARY' : 'RESUMO PROFISSIONAL',
    font: 'F2',
    size: 11,
    spacingBefore: 12
  });
  for (const l of wrapText(cv.summary, 90)) {
    lines.push({ text: l, font: 'F1', size: 9.5, spacingBefore: 2 });
  }

  // Certifications section
  lines.push({
    text: isEn ? 'CERTIFICATIONS' : 'CERTIFICACOES & CREDENCIAIS',
    font: 'F2',
    size: 11,
    spacingBefore: 12
  });
  for (const cert of cv.certifications) {
    lines.push({ text: `- ${cert}`, font: 'F2', size: 9.5, spacingBefore: 2 });
  }

  // Core Technical Skills & Practical Experience
  lines.push({
    text: isEn
      ? 'TECHNICAL SKILLS & HANDS-ON DEVOPS EXPERIENCE'
      : 'COMPETENCIAS TECNICAS & EXPERIENCIA PRATICA DEVOPS',
    font: 'F2',
    size: 11,
    spacingBefore: 12
  });

  for (const bullet of cv.experienceBullets) {
    const wrapped = wrapText(`- ${bullet}`, 90);
    wrapped.forEach((lineText, idx) => {
      lines.push({
        text: idx === 0 ? lineText : `  ${lineText}`,
        font: 'F1',
        size: 9.5,
        spacingBefore: idx === 0 ? 4 : 1.5
      });
    });
  }

  // Keywords block for ATS parsers
  lines.push({
    text: isEn ? 'CORE STACK & ATS KEYWORDS' : 'STACK TECNOLOGICA & PALAVRAS-CHAVE ATS',
    font: 'F2',
    size: 10.5,
    spacingBefore: 12
  });
  const kwLine = cv.gupyKit.skillsTagsToAdd.join(' | ');
  for (const l of wrapText(kwLine, 90)) {
    lines.push({ text: l, font: 'F1', size: 9, spacingBefore: 2 });
  }

  // Build content stream
  const ops: string[] = ['BT'];
  let y = 795;

  for (const line of lines) {
    y -= (line.spacingBefore ?? 2) + line.size + 2;
    if (y < 45) break;
    const encoded = encodePdfWinAnsiString(line.text);
    ops.push(`/${line.font} ${line.size} Tf`);
    ops.push(`1 0 0 1 45 ${y.toFixed(1)} Tm`);
    ops.push(`(${encoded}) Tj`);
  }
  ops.push('ET');
  const streamContent = ops.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj',
    `6 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'latin1')} >>\nstream\n${streamContent}\nendstream\nendobj`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += obj + '\n';
  }

  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
