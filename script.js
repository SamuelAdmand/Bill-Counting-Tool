// Set the workerSrc for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;

// DOM Element References
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const analyzeButton = document.getElementById('analyzeButton');
const filePathDisplay = document.getElementById('filePath');
const statusLabel = document.getElementById('status');
const resultsArea = document.getElementById('resultsArea');
const includeTokensToggle = document.getElementById('includeTokensToggle');

let selectedFile = null;
let lastResults = null; // To store the most recent analysis results

// --- Event Listeners ---
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => e.target.files[0] && handleFile(e.target.files[0]));
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drop-zone-active'); });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drop-zone-active'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drop-zone-active');
    e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]);
});
analyzeButton.addEventListener('click', analyzeFile);
// Add listener for the new toggle switch
includeTokensToggle.addEventListener('change', () => {
    if (lastResults) {
        displayResults(lastResults); // Re-render results when toggle changes
    }
});

// --- Core Functions ---
function handleFile(file) {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const allowedExtensions = ['xml', 'pdf', 'xlsx'];
    if (allowedExtensions.includes(fileExtension)) {
        selectedFile = file;
        lastResults = null; // Reset previous results
        filePathDisplay.textContent = `Selected: ${file.name}`;
        analyzeButton.disabled = false;
        updateStatus('File selected. Ready to analyze.', 'success');
        resultsArea.textContent = '';
    } else {
        selectedFile = null;
        filePathDisplay.textContent = '';
        analyzeButton.disabled = true;
        updateStatus(`Error: Invalid file type. Please select XML, PDF, or XLSX.`, 'error');
    }
}

function updateStatus(message, type = 'info') {
    statusLabel.textContent = message;
    statusLabel.className = 'text-sm font-medium px-3 py-1 rounded-full'; // Reset classes
    const typeClasses = {
        success: 'bg-green-100 text-green-800',
        error: 'bg-red-100 text-red-800',
        processing: 'bg-yellow-100 text-yellow-800',
        info: 'bg-slate-200 text-slate-600'
    };
    statusLabel.classList.add(...(typeClasses[type] || typeClasses.info).split(' '));
}

async function analyzeFile() {
    if (!selectedFile) {
        updateStatus('Error: No file selected.', 'error');
        return;
    }
    updateStatus('Processing file...', 'processing');
    analyzeButton.disabled = true;
    resultsArea.textContent = 'Analyzing... please wait.';

    try {
        const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
        if (fileExtension === 'xml') {
            const textContent = await selectedFile.text();
            parseXMLContent(textContent);
        } else if (fileExtension === 'pdf') {
            const textContent = await readPdfFile(selectedFile);
            const linesAsRows = textContent.split('\n').map(line => [line]);
            parseStructuredText(linesAsRows, 'PDF');
        } else if (fileExtension === 'xlsx') {
            const data = await readXlsxFile(selectedFile);
            parseStructuredText(data, 'Excel');
        } else {
            throw new Error('Unsupported file type for analysis.');
        }
    } catch (error) {
        console.error('Analysis Error:', error);
        updateStatus(`Error: ${error.message}`, 'error');
        resultsArea.textContent = `Failed to analyze file. Please check if the file is valid and not corrupted.\n\nDetails: ${error.message}`;
    } finally {
        analyzeButton.disabled = false;
    }
}

async function readPdfFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
}

function readXlsxFile(file) {
     return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const allRows = [];
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    sheetData.forEach(row => row.length > 0 && allRows.push(row));
                });
                resolve(allRows);
            } catch (e) { reject(e); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Parses structured XML content. This is the most reliable method.
 * @param {string} xmlString The XML content as a string.
 */
function parseXMLContent(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse XML file. It may be corrupted or malformed.");
    }

    let vVoucherCount = 0, normalBillCount = 0, eBillCount = 0;
    const normalBillTokens = [];
    const vouchers = xmlDoc.getElementsByTagName('VoucherNumber');

    for (const voucher of vouchers) {
        if (String(voucher.getAttribute('VoucherNumber')).trim().startsWith('V')) {
            vVoucherCount++;
            const detailsList = voucher.getElementsByTagName('Details');
            let isVoucherNormal = Array.from(detailsList).some(d => d.getAttribute('billType') === 'Normal');
            
            if (isVoucherNormal) {
                normalBillCount++;
                const tokenEl = voucher.getElementsByTagName('TokenNumber')[0];
                if (tokenEl) {
                    const token = String(tokenEl.getAttribute('TokenNumber')).trim().split(/[\s\r\n]+/)[0];
                    if (token) normalBillTokens.push(token);
                }
            } else if (detailsList.length > 0) {
                eBillCount++;
            }
        }
    }
    // Sort tokens numerically before storing them
    normalBillTokens.sort((a, b) => a - b);
    const results = { vVoucherCount, normalBillCount, eBillCount, normalBillTokens };
    lastResults = results; // Store results
    displayResults(results);
}

/**
 * Parses less-structured data from PDF/Excel by analyzing rows/lines.
 * @param {Array<Array<string>>} rows Data represented as an array of rows, where each row is an array of cells/strings.
 * @param {'PDF'|'Excel'} format The source format, for logging purposes.
 */
function parseStructuredText(rows, format) {
    let vVoucherCount = 0, normalBillCount = 0, eBillCount = 0;
    const normalBillTokens = [];
    let voucherCol = -1, billTypeCol = -1, tokenCol = -1;

    if (format === 'Excel') {
        const headerRowIndex = rows.findIndex(row => /voucher number/i.test(row.join(' ')) && /bill type/i.test(row.join(' ')));
        if (headerRowIndex !== -1) {
            const headerRow = rows[headerRowIndex].map(h => String(h).toLowerCase());
            voucherCol = headerRow.findIndex(h => /voucher number/i.test(h));
            billTypeCol = headerRow.findIndex(h => /bill type/i.test(h));
            tokenCol = headerRow.findIndex(h => /token number/i.test(h));
        }
    }
    
    for (const row of rows) {
        let voucherNumber = '', billType = '', tokenNumber = '';

        if (voucherCol !== -1 && billTypeCol !== -1) {
            voucherNumber = row[voucherCol] || '';
            billType = row[billTypeCol] || '';
            tokenNumber = (tokenCol !== -1) ? (row[tokenCol] || '') : '';
        } else {
            const rowText = row.join(' ');
            const voucherMatch = rowText.match(/\bV\d+\b/);
            if (!voucherMatch) continue;
            
            voucherNumber = voucherMatch[0];
            if (/Normal/i.test(rowText) && !/e-Bill/i.test(rowText)) { billType = 'Normal'; } 
            else if (/e-Bill/i.test(rowText)) { billType = 'e-Bill'; }
            
            const pTokens = rowText.match(/\b\d{4,5}\b/g) || [];
            for (const pToken of pTokens) {
                if (!new RegExp(pToken + '\\.\\d+').test(rowText)) { tokenNumber = pToken; break; }
            }
        }
        
        if (String(voucherNumber).trim().startsWith('V')) {
            vVoucherCount++;
            if (/Normal/i.test(String(billType))) {
                normalBillCount++;
                if(tokenNumber) normalBillTokens.push(String(tokenNumber).trim());
            } else if (/e-Bill/i.test(String(billType))) {
                eBillCount++;
            }
        }
    }

    if (vVoucherCount > 0 && vVoucherCount !== (normalBillCount + eBillCount)) {
         console.warn(`Potential parsing discrepancy. Please verify the source file format.`);
    }
    
    const uniqueTokens = [...new Set(normalBillTokens)];
    // Sort unique tokens numerically before storing them
    uniqueTokens.sort((a, b) => a - b);

    const results = { vVoucherCount, normalBillCount, eBillCount, normalBillTokens: uniqueTokens };
    lastResults = results; // Store results
    displayResults(results);
}

function displayResults(results) {
    const { vVoucherCount, normalBillCount, eBillCount, normalBillTokens } = results;
    // Check the state of the toggle switch
    const shouldIncludeTokens = includeTokensToggle.checked;

    let summary = `--- Analysis Summary ---\n\n`;
    summary += `Total 'V' Vouchers Found: ${vVoucherCount}\n\n`;
    summary += `Breakdown by Bill Type:\n`;
    summary += ` - Normal Bills: ${normalBillCount}\n`;
    summary += ` - e-Bills:      ${eBillCount}\n\n`;

    // Conditionally add the token numbers based on the toggle's state
    if (shouldIncludeTokens) {
        if (normalBillTokens && normalBillTokens.length > 0) {
            summary += `Token Numbers for Normal Vouchers:\n`;
            summary += ` ${normalBillTokens.join(', ')}\n`;
        } else if (normalBillCount > 0) {
             summary += `Token Numbers for Normal Vouchers:\n`;
             summary += ` (No token numbers could be identified in the report)\n`
        }
    }

    resultsArea.textContent = summary;
    updateStatus('Analysis complete.', 'success');
}
