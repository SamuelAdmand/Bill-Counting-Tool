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
        resultsArea.innerHTML = ''; // Clear previous results view
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
    resultsArea.innerHTML = '<p class="text-center text-slate-500">Analyzing... please wait.</p>';

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
        resultsArea.innerHTML = `<p class="text-center text-red-600">Failed to analyze file. Please check if the file is valid and not corrupted.<br><span class="text-sm">${error.message}</span></p>`;
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

function parseXMLContent(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse XML file. It may be corrupted or malformed.");
    }

    let vVoucherCount = 0, vNormalBillCount = 0, vEBillCount = 0;
    let cVoucherCount = 0, cNormalBillCount = 0, cEBillCount = 0;
    const vNormalBillTokens = [];
    const cNormalBillTokens = [];
    const vouchers = xmlDoc.getElementsByTagName('VoucherNumber');

    for (const voucher of vouchers) {
        const voucherNumberStr = String(voucher.getAttribute('VoucherNumber')).trim();
        const detailsList = voucher.getElementsByTagName('Details');
        const isVoucherNormal = Array.from(detailsList).some(d => d.getAttribute('billType') === 'Normal');
        const tokenEl = voucher.getElementsByTagName('TokenNumber')[0];
        const token = tokenEl ? String(tokenEl.getAttribute('TokenNumber')).trim().split(/[\s\r\n]+/)[0] : null;

        if (voucherNumberStr.startsWith('V')) {
            vVoucherCount++;
            if (isVoucherNormal) {
                vNormalBillCount++;
                if (token) vNormalBillTokens.push(token);
            } else if (detailsList.length > 0) {
                vEBillCount++;
            }
        } else if (voucherNumberStr.startsWith('C')) {
            cVoucherCount++;
            if (isVoucherNormal) {
                cNormalBillCount++;
                if (token) cNormalBillTokens.push(token);
            } else if (detailsList.length > 0) {
                cEBillCount++;
            }
        }
    }
    
    vNormalBillTokens.sort((a, b) => a - b);
    cNormalBillTokens.sort((a, b) => a - b);

    const results = { 
        vVoucherCount, vNormalBillCount, vEBillCount, vNormalBillTokens,
        cVoucherCount, cNormalBillCount, cEBillCount, cNormalBillTokens
    };
    lastResults = results;
    displayResults(results);
}

function parseStructuredText(rows, format) {
    let vVoucherCount = 0, vNormalBillCount = 0, vEBillCount = 0;
    let cVoucherCount = 0, cNormalBillCount = 0, cEBillCount = 0;
    const vNormalBillTokens = [];
    const cNormalBillTokens = [];
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
            const voucherMatch = rowText.match(/\b[VC]\d+\b/);
            if (!voucherMatch) continue;
            
            voucherNumber = voucherMatch[0];
            if (/Normal/i.test(rowText) && !/e-Bill/i.test(rowText)) { billType = 'Normal'; } 
            else if (/e-Bill/i.test(rowText)) { billType = 'e-Bill'; }
            
            const pTokens = rowText.match(/\b\d{4,5}\b/g) || [];
            for (const pToken of pTokens) {
                if (!new RegExp(pToken + '\\.\\d+').test(rowText)) { tokenNumber = pToken; break; }
            }
        }
        
        const trimmedVoucher = String(voucherNumber).trim();
        if (trimmedVoucher.startsWith('V')) {
            vVoucherCount++;
            if (/Normal/i.test(String(billType))) {
                vNormalBillCount++;
                if(tokenNumber) vNormalBillTokens.push(String(tokenNumber).trim());
            } else if (/e-Bill/i.test(String(billType))) {
                vEBillCount++;
            }
        } else if (trimmedVoucher.startsWith('C')) {
            cVoucherCount++;
            if (/Normal/i.test(String(billType))) {
                cNormalBillCount++;
                if(tokenNumber) cNormalBillTokens.push(String(tokenNumber).trim());
            } else if (/e-Bill/i.test(String(billType))) {
                cEBillCount++;
            }
        }
    }
    
    const vUniqueTokens = [...new Set(vNormalBillTokens)];
    vUniqueTokens.sort((a, b) => a - b);

    const cUniqueTokens = [...new Set(cNormalBillTokens)];
    cUniqueTokens.sort((a, b) => a - b);

    const results = { 
        vVoucherCount, vNormalBillCount, vEBillCount, vNormalBillTokens: vUniqueTokens,
        cVoucherCount, cNormalBillCount, cEBillCount, cNormalBillTokens: cUniqueTokens
    };
    lastResults = results;
    displayResults(results);
}

function displayResults(results) {
    const { 
        vVoucherCount, vNormalBillCount, vEBillCount, vNormalBillTokens,
        cVoucherCount, cNormalBillCount, cEBillCount, cNormalBillTokens 
    } = results;
    
    const shouldIncludeTokens = includeTokensToggle.checked;
    let resultsHTML = '';

    const createResultCard = (title, totalCount, normalCount, eBillCount, tokens) => {
        if (totalCount === 0) return ''; // Don't show a card if there are no vouchers of this type

        let tokenHTML = '';
        if (shouldIncludeTokens && normalCount > 0) {
            tokenHTML += `<div class="mt-4 pt-3 border-t border-slate-200">
                            <h4 class="font-semibold text-slate-600 mb-2">Token Numbers for Normal Bills</h4>`;
            if (tokens && tokens.length > 0) {
                tokenHTML += `<div class="flex flex-wrap gap-2">
                                ${tokens.map(token => `<span class="bg-blue-100 text-blue-800 text-xs font-mono font-medium px-2.5 py-1 rounded-full">${token}</span>`).join('')}
                             </div>`;
            } else {
                tokenHTML += `<p class="text-sm text-slate-500 italic">(No token numbers could be identified)</p>`;
            }
            tokenHTML += `</div>`;
        }

        return `
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-4 animate-fade-in">
                <h3 class="text-lg font-bold text-slate-700 mb-3">${title}</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between items-center">
                        <span class="text-slate-600">Total Vouchers Found:</span>
                        <span class="font-bold text-slate-800 text-base">${totalCount}</span>
                    </div>
                    <div class="flex justify-between items-center pl-4">
                        <span class="text-slate-500">- Normal Bills:</span>
                        <span class="font-medium text-slate-600">${normalCount}</span>
                    </div>
                    <div class="flex justify-between items-center pl-4">
                        <span class="text-slate-500">- e-Bills:</span>
                        <span class="font-medium text-slate-600">${eBillCount}</span>
                    </div>
                </div>
                ${tokenHTML}
            </div>
        `;
    };

    resultsHTML += createResultCard("NCDDO Analysis (V Vouchers)", vVoucherCount, vNormalBillCount, vEBillCount, vNormalBillTokens);
    resultsHTML += createResultCard("CDDO Analysis (C Vouchers)", cVoucherCount, cNormalBillCount, cEBillCount, cNormalBillTokens);

    if (vVoucherCount === 0 && cVoucherCount === 0) {
        resultsHTML = `
            <div class="text-center py-10 animate-fade-in">
                <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 class="mt-2 text-lg font-medium text-slate-800">No Vouchers Found</h3>
                <p class="mt-1 text-sm text-slate-500">The analyzer could not find any 'V' or 'C' vouchers in the provided file.</p>
            </div>
        `;
    }

    resultsArea.innerHTML = resultsHTML;
    updateStatus('Analysis complete.', 'success');
}