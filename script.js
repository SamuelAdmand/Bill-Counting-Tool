// --- DOM Element References ---
// Screens and Containers
const selectionScreen = document.getElementById('selectionScreen');
const readymadeSection = document.getElementById('readymadeSection');
const manualSection = document.getElementById('manualSection');
const headerSubtitle = document.getElementById('header-subtitle');

// Buttons
const showReadymadeBtn = document.getElementById('showReadymadeBtn');
const showManualBtn = document.getElementById('showManualBtn');
const backBtns = document.querySelectorAll('.back-btn');
const generateManualPdfButton = document.getElementById('generateManualPdfButton');

// --- Readymade Section Elements ---
const dropZone1 = document.getElementById('dropZone1');
const fileInput1 = document.getElementById('fileInput1');
const filePath1 = document.getElementById('filePath1');
const dropZone2 = document.getElementById('dropZone2');
const fileInput2 = document.getElementById('fileInput2');
const filePath2 = document.getElementById('filePath2');
const analyzeButton = document.getElementById('analyzeButton');
const generatePdfButton = document.getElementById('generatePdfButton');
const statusLabel = document.getElementById('status');
const resultsArea = document.getElementById('resultsArea');

// --- Global State ---
let selectedFile1 = null;
let selectedFile2 = null;
let lastAnalysisResults = null; // Store the results for PDF generation

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', initialize);

function initialize() {
    // UI Switching Listeners
    showReadymadeBtn.addEventListener('click', () => showScreen('readymade'));
    showManualBtn.addEventListener('click', () => showScreen('manual'));
    backBtns.forEach(btn => btn.addEventListener('click', () => showScreen('selection')));

    // Readymade Workflow Listeners
    setupEventListeners(dropZone1, fileInput1, (file) => handleFile(file, 1));
    setupEventListeners(dropZone2, fileInput2, (file) => handleFile(file, 2));
    analyzeButton.addEventListener('click', analyzeFiles);
    generatePdfButton.addEventListener('click', generateReadymadePdfReport);

    // Manual Workflow Listener
    generateManualPdfButton.addEventListener('click', generateManualPdfReport);
}

// --- UI Management ---
function showScreen(screenName) {
    // Hide all sections first
    selectionScreen.classList.add('hidden');
    readymadeSection.classList.add('hidden');
    manualSection.classList.add('hidden');

    // Show the selected section
    if (screenName === 'readymade') {
        readymadeSection.classList.remove('hidden');
        headerSubtitle.textContent = 'Upload both XML reports to begin analysis.';
    } else if (screenName === 'manual') {
        manualSection.classList.remove('hidden');
        headerSubtitle.textContent = 'Fill in the details below to create your report.';
    } else { // 'selection'
        selectionScreen.classList.remove('hidden');
        headerSubtitle.textContent = 'Choose a report generation method.';
    }
}


// ===================================================================================
// === READYMADE REPORT WORKFLOW =====================================================
// ===================================================================================

function setupEventListeners(dropZone, fileInput, fileHandler) {
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => e.target.files[0] && fileHandler(e.target.files[0]));
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drop-zone-active'); });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drop-zone-active'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drop-zone-active');
        e.dataTransfer.files[0] && fileHandler(e.dataTransfer.files[0]);
    });
}

function handleFile(file, fileNumber) {
    if (file.name.split('.').pop().toLowerCase() !== 'xml') {
        updateStatus('Error: Invalid file type. Please select XML.', 'error');
        return;
    }

    if (fileNumber === 1) {
        selectedFile1 = file;
        filePath1.textContent = `Selected: ${file.name}`;
    } else {
        selectedFile2 = file;
        filePath2.textContent = `Selected: ${file.name}`;
    }
    
    lastAnalysisResults = null;
    generatePdfButton.disabled = true;
    checkFilesReady();
}

function checkFilesReady() {
    if (selectedFile1 && selectedFile2) {
        analyzeButton.disabled = false;
        updateStatus('Files ready. Click Analyze.', 'success');
    } else {
        analyzeButton.disabled = true;
        updateStatus('Waiting for both files...', 'info');
    }
}

function updateStatus(message, type = 'info') {
    statusLabel.textContent = message;
    statusLabel.className = 'text-sm font-medium px-3 py-1 rounded-full whitespace-nowrap'; // Reset classes
    const typeClasses = {
        success: 'bg-green-100 text-green-800',
        error: 'bg-red-100 text-red-800',
        processing: 'bg-yellow-100 text-yellow-800',
        info: 'bg-slate-200 text-slate-600'
    };
    statusLabel.classList.add(...(typeClasses[type] || typeClasses.info).split(' '));
}

async function analyzeFiles() {
    if (!selectedFile1 || !selectedFile2) {
        updateStatus('Error: Both files are required.', 'error');
        return;
    }
    updateStatus('Processing files...', 'processing');
    analyzeButton.disabled = true;
    generatePdfButton.disabled = true;
    resultsArea.innerHTML = '<p class="text-center text-slate-500">Analyzing... please wait.</p>';

    try {
        const parser = new DOMParser();
        const xmlString1 = await selectedFile1.text();
        const xmlDoc1 = parser.parseFromString(xmlString1, "application/xml");
        const xmlString2 = await selectedFile2.text();
        const xmlDoc2 = parser.parseFromString(xmlString2, "application/xml");

        let paymentAuthDoc, compilationDoc;
        const name1 = xmlDoc1.documentElement.getAttribute('Name');
        const name2 = xmlDoc2.documentElement.getAttribute('Name');

        if (name1 === 'RptSancDig_EPaymentAuthorizationIssueRegister' && name2 === 'RptSancDig_VoucherCompilationSheet') {
            paymentAuthDoc = xmlDoc1;
            compilationDoc = xmlDoc2;
        } else if (name2 === 'RptSancDig_EPaymentAuthorizationIssueRegister' && name1 === 'RptSancDig_VoucherCompilationSheet') {
            paymentAuthDoc = xmlDoc2;
            compilationDoc = xmlDoc1;
        } else {
            throw new Error("Could not identify report types. Please upload one of each.");
        }
        
        const paymentAuthData = parsePaymentAuthXML(paymentAuthDoc);
        const compilationData = parseCompilationSheetXML(compilationDoc);
        const reportDate = compilationData.reportDate || paymentAuthData.issueDate;

        lastAnalysisResults = reconcileData(compilationData.vouchers, paymentAuthData.voucherDetailsMap, reportDate);
        displayResults(lastAnalysisResults);
        
        generatePdfButton.disabled = false;

    } catch (error) {
        console.error('Analysis Error:', error);
        updateStatus(`Error: ${error.message}`, 'error');
        resultsArea.innerHTML = `<p class="text-center text-red-600">Failed to analyze files. Check if they are valid.<br><span class="text-sm">${error.message}</span></p>`;
    } finally {
        analyzeButton.disabled = false;
    }
}

function parsePaymentAuthXML(xmlDoc) {
    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse E-Payment Authorization Register.");
    }
    const voucherDetailsMap = new Map();
    const voucherNodes = Array.from(xmlDoc.getElementsByTagName('VoucherNumber'));

    for (const voucher of voucherNodes) {
        const voucherNumberStr = String(voucher.getAttribute('VoucherNumber')).trim().split(/[\s\r\n]+/)[0];
        const detailsList = voucher.getElementsByTagName('Details');
        if (detailsList.length > 0) {
            const firstDetail = detailsList[0];
            const billType = firstDetail.getAttribute('billType') || 'Normal';
            const userNm = firstDetail.getAttribute('UserNm') || null;
            const tokenEl = voucher.getElementsByTagName('TokenNumber')[0];
            const tokenStr = tokenEl ? tokenEl.getAttribute('TokenNumber') : '';
            const token = tokenStr ? String(tokenStr).trim().split(/[\s\r\n]+/)[0] : null;
            if (voucherNumberStr) {
                voucherDetailsMap.set(voucherNumberStr, { billType, userNm, token });
            }
        }
    }
    
    let reportDate = '';
    const dateRangeNode = xmlDoc.querySelector('Tablix2');
    if (dateRangeNode) {
        const dateRangeAttr = dateRangeNode.getAttribute('Textbox21');
        if (dateRangeAttr) {
            reportDate = dateRangeAttr.split(' till ')[0].trim().replace(/-/g, '/');
        }
    }
    return { voucherDetailsMap, issueDate: reportDate };
}

function parseCompilationSheetXML(xmlDoc) {
    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse Voucher Compilation Sheet.");
    }
    const allVouchers = [];
    const ddoNodes = Array.from(xmlDoc.getElementsByTagName('DDOName'));
    const genericTerms = /ELECTRONIC ADVICES|SUSPENSE|CHEQUES|DEFAULT|DEDUCTIONS|CONTRIBUTIONS|GST|PUBLIC ACCOUNT|OTHERS/i;

    for (const ddoNode of ddoNodes) {
        const ddoNameEl = ddoNode.querySelector('Textbox11');
        const ddoName = ddoNameEl ? ddoNameEl.getAttribute('DDOName') : '';
        const voucherNodes = Array.from(ddoNode.getElementsByTagName('VoucherNumber'));

        for (const voucherNode of voucherNodes) {
            const voucherNumber = voucherNode.getAttribute('VoucherNumber1');
            if (!voucherNumber) continue;

            const detailNodes = Array.from(voucherNode.getElementsByTagName('Details'));
            const objectHeads = new Set();
            const funcHeads = new Set();

            for (const detail of detailNodes) {
                const processHead = (headAttr) => {
                    if (!headAttr) return;
                    const cleanedHead = headAttr.replace(/\s*\[\s*(\d+)\s*\]/, '[$1]').trim();
                    if (cleanedHead && !genericTerms.test(cleanedHead.toUpperCase())) {
                        return cleanedHead;
                    }
                    return null;
                };
                const objHead = processHead(detail.getAttribute('ObjectHead'));
                if (objHead) objectHeads.add(objHead);
                const funcHead = processHead(detail.getAttribute('FuncHead'));
                if (funcHead) funcHeads.add(funcHead);
            }
            allVouchers.push({ voucherNumber, ddoName, objectHeads: Array.from(objectHeads), funcHeads: Array.from(funcHeads) });
        }
    }
    
    let reportDate = '';
    const dateRangeNode = xmlDoc.querySelector('Tablix2');
    if (dateRangeNode) {
        const dateRangeAttr = dateRangeNode.getAttribute('Textbox18');
        if (dateRangeAttr) {
            reportDate = dateRangeAttr.split('  ')[0].trim().replace(/-/g, '/');
        }
    }
    return { vouchers: allVouchers, reportDate };
}

function reconcileData(compilationVouchers, paymentAuthMap, issueDate) {
    let ncddoNormalBills = [], ncddoEBills = [], cddoNormalBills = [], cddoEBills = [];

    for (const voucher of compilationVouchers) {
        const paymentDetails = paymentAuthMap.get(voucher.voucherNumber);
        voucher.billType = paymentDetails ? paymentDetails.billType : 'Normal';
        voucher.userNm = paymentDetails ? paymentDetails.userNm : null;
        voucher.token = paymentDetails ? paymentDetails.token : null;
        const isNCDDO = voucher.ddoName.toUpperCase().includes('LUCKNOW');
        if (isNCDDO) {
            if (voucher.billType === 'Normal') ncddoNormalBills.push(voucher);
            else ncddoEBills.push(voucher);
        } else {
            if (voucher.billType === 'Normal') cddoNormalBills.push(voucher);
            else cddoEBills.push(voucher);
        }
    }
    
    const sortByToken = (a, b) => (a.token || 0) - (b.token || 0);
    ncddoNormalBills.sort(sortByToken);
    cddoNormalBills.sort(sortByToken);

    return { ncddoNormalBills, ncddoEBills, cddoNormalBills, cddoEBills, issueDate };
}

function getDisplayCategory(bill) {
    let categories = [];
    let hasUserNmCategory = false;
    if (bill.userNm) {
        if (bill.userNm.includes('[GPFEIS]')) { categories.push('Gpf'); hasUserNmCategory = true; }
        if (bill.userNm.includes('[EIS]')) { categories.push('Salary(eis)'); hasUserNmCategory = true; }
        if (bill.userNm.includes('[GEM]')) { categories.push('Gem'); hasUserNmCategory = true; }
        if (bill.userNm.includes('[Pension]')) { categories.push('Pension'); hasUserNmCategory = true; }
    }
    if (!hasUserNmCategory) {
        if (bill.objectHeads && bill.objectHeads.length > 0) categories.push(...bill.objectHeads);
        else if (bill.funcHeads && bill.funcHeads.length > 0) categories.push(...bill.funcHeads);
    }
    if (categories.length === 0) return 'Uncategorized';
    return categories.join(', ');
}

function displayResults(results) {
    const { ncddoNormalBills, ncddoEBills, cddoNormalBills, cddoEBills } = results;
    let resultsHTML = '';
    const totalVouchers = ncddoNormalBills.length + ncddoEBills.length + cddoNormalBills.length + cddoEBills.length;

    const createResultCard = (title, normalBills, eBillCount) => {
        const totalCount = normalBills.length + eBillCount;
        if (totalCount === 0) return '';
        let tokenHTML = '';
        if (normalBills.length > 0) {
            tokenHTML = `<div class="mt-4 pt-3 border-t border-slate-200">
                <h4 class="font-semibold text-slate-600 mb-2">Categorized Normal Bills</h4>
                <div class="space-y-2">
                    ${normalBills.map(bill => `
                        <div class="flex items-start gap-3 p-2 bg-white rounded-md border border-slate-200">
                            <span class="bg-blue-100 text-blue-800 text-xs font-mono font-medium px-2.5 py-1 rounded-full mt-0.5">${bill.token || 'N/A'}</span>
                            <div class="flex-1 text-sm">
                                <span class="font-medium text-slate-800">${getDisplayCategory(bill)}</span>
                                <span class="text-slate-500 text-xs block">(${bill.voucherNumber})</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }
        return `<div class="bg-slate-50 border border-slate-200 rounded-lg p-4 animate-fade-in">
            <h3 class="text-lg font-bold text-slate-700 mb-3">${title}</h3>
            <div class="space-y-2 text-sm">
                <div class="flex justify-between items-center"><span class="text-slate-600">Total Vouchers Found:</span><span class="font-bold text-slate-800 text-base">${totalCount}</span></div>
                <div class="flex justify-between items-center pl-4"><span class="text-slate-500">- Normal Bills:</span><span class="font-medium text-slate-600">${normalBills.length}</span></div>
                <div class="flex justify-between items-center pl-4"><span class="text-slate-500">- e-Bills:</span><span class="font-medium text-slate-600">${eBillCount}</span></div>
            </div>
            ${tokenHTML}
        </div>`;
    };

    resultsHTML += createResultCard("NCDDO Analysis (Lucknow)", ncddoNormalBills, ncddoEBills.length);
    resultsHTML += createResultCard("CDDO Analysis (Outer)", cddoNormalBills, cddoEBills.length);

    if (totalVouchers === 0) {
        resultsHTML = `<div class="text-center py-10 animate-fade-in">
            <h3 class="mt-2 text-lg font-medium text-slate-800">No Vouchers Found</h3>
            <p class="mt-1 text-sm text-slate-500">The analyzer could not find any vouchers in the provided files.</p>
        </div>`;
    }
    resultsArea.innerHTML = resultsHTML;
    updateStatus('Analysis complete.', 'success');
}

function generateReadymadePdfReport() {
    if (!lastAnalysisResults) {
        alert("Please analyze the reports first.");
        return;
    }
    const { ncddoNormalBills, ncddoEBills, cddoNormalBills, cddoEBills, issueDate } = lastAnalysisResults;
    const reportDate = issueDate || new Date().toLocaleDateString('en-GB');

    const data = {
        eBillsNCDDO: { passed: ncddoEBills.length, returned: 0 },
        eBillsCDDO: { passed: cddoEBills.length, returned: 0 },
        normalBillsNCDDO: { passed: ncddoNormalBills.length, returned: 0 },
        normalBillsCDDO: { passed: cddoNormalBills.length, returned: 0 },
    };

    const getRemarks = (bills) => {
        if (bills.length === 0) return '';
        const counts = bills.reduce((acc, bill) => {
            const category = getDisplayCategory(bill);
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([cat, count]) => `• ${cat}- ${count} ${count > 1 ? 'Bills' : 'Bill'}`).join('\n');
    };

    data.normalBillsNCDDO.remarks = getRemarks(ncddoNormalBills);
    data.normalBillsCDDO.remarks = getRemarks(cddoNormalBills);

    const totalPassedEBills = data.eBillsNCDDO.passed + data.eBillsCDDO.passed;
    const totalPassedBills = totalPassedEBills + data.normalBillsNCDDO.passed + data.normalBillsCDDO.passed;
    const percentage = totalPassedBills > 0 ? `${((totalPassedEBills / totalPassedBills) * 100).toFixed(2)}%` : "0.00%";

    generatePdf(reportDate, data, percentage);
}


// ===================================================================================
// === MANUAL REPORT WORKFLOW ========================================================
// ===================================================================================

function generateManualPdfReport() {
    const getVal = (id) => parseInt(document.getElementById(id).value, 10) || 0;

    const data = {
        eBillsNCDDO: { passed: getVal('manual-ebills-passed-ncddo'), returned: getVal('manual-ebills-returned-ncddo') },
        eBillsCDDO: { passed: getVal('manual-ebills-passed-cddo'), returned: getVal('manual-ebills-returned-cddo') },
        normalBillsNCDDO: { passed: getVal('manual-normal-passed-ncddo'), returned: getVal('manual-normal-returned-ncddo'), remarks: document.getElementById('manual-remarks-ncddo').value },
        normalBillsCDDO: { passed: getVal('manual-normal-passed-cddo'), returned: getVal('manual-normal-returned-cddo'), remarks: document.getElementById('manual-remarks-cddo').value },
    };

    const reportDate = document.getElementById('manual-report-date').value.trim() || new Date().toLocaleDateString('en-GB');
    const percentage = document.getElementById('manual-percentage').value.trim() || 'Not provided';

    generatePdf(reportDate, data, percentage);
}


// ===================================================================================
// === SHARED PDF GENERATION LOGIC ===================================================
// ===================================================================================

function generatePdf(reportDate, data, percentage) {
    const doc = new window.jspdf.jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("PAO, GSI(NR),Lucknow", 105, 20, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Daily Status Report of E. Bills", 105, 27, { align: "center" });
    doc.text(`Date: ${reportDate}`, 20, 40);

    const tableX = 20;
    const headerY = 50;
    const colWidths = [60, 25, 25, 25, 35];
    const headers = ["Type of Bills", "Passed", "Returned", "Total", "Remarks"];
    const headerHeight = 10;
    const lineHeight = 5;

    doc.setFont("helvetica", "bold");
    headers.forEach((header, i) => {
        const xPos = tableX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.rect(xPos, headerY, colWidths[i], headerHeight);
        doc.text(header, xPos + colWidths[i] / 2, headerY + headerHeight / 2 + 2, { align: "center" });
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    
    const rows = [
        ["E. Bills- NCDDO", data.eBillsNCDDO.passed, data.eBillsNCDDO.returned, data.eBillsNCDDO.passed + data.eBillsNCDDO.returned, ""],
        ["E. Bills- CDDO", data.eBillsCDDO.passed, data.eBillsCDDO.returned, data.eBillsCDDO.passed + data.eBillsCDDO.returned, ""],
        ["Normal Bills- NCDDO", data.normalBillsNCDDO.passed, data.normalBillsNCDDO.returned, data.normalBillsNCDDO.passed + data.normalBillsNCDDO.returned, data.normalBillsNCDDO.remarks || ""],
        ["Normal Bills- CDDO", data.normalBillsCDDO.passed, data.normalBillsCDDO.returned, data.normalBillsCDDO.passed + data.normalBillsCDDO.returned, data.normalBillsCDDO.remarks || ""],
    ];

    let currentY = headerY + headerHeight;

    rows.forEach((row) => {
        const remarksText = String(row[4]);
        const textLines = doc.splitTextToSize(remarksText, colWidths[4] - 4);
        const calculatedHeight = (textLines.length * lineHeight) + 4;
        const rowHeight = remarksText ? Math.max(10, calculatedHeight) : 10;

        row.forEach((cell, colIndex) => {
            const xPos = tableX + colWidths.slice(0, colIndex).reduce((a, b) => a + b, 0);
            doc.rect(xPos, currentY, colWidths[colIndex], rowHeight);
            const middleY = currentY + rowHeight / 2;
            if (colIndex === 4 && remarksText) {
                const textBlockHeight = (textLines.length - 1) * lineHeight;
                const startY = middleY - (textBlockHeight / 2);
                doc.text(textLines, xPos + 2, startY, { baseline: 'middle' });
            } else {
                 doc.text(String(cell), xPos + colWidths[colIndex] / 2, middleY, { align: "center", baseline: 'middle' });
            }
        });
        currentY += rowHeight;
    });

    const footerY = currentY + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Percentage of E. Bills being passed: ${percentage}`, 20, footerY);
    
    doc.setFont("helvetica", "normal");
    doc.text("Assistant Accounts Officer", 190, footerY + 20, { align: "right" });
    doc.text("Pre-Check Section", 190, footerY + 25, { align: "right" });
    doc.text("PAO, GSI(NR), Lucknow", 190, footerY + 30, { align: "right" });

    doc.save(`Daily_Status_Report_${reportDate.replace(/\//g, '-')}.pdf`);
}