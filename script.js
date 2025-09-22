// --- DOM Element References ---
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
const manualInputSection = document.getElementById('manualInputSection');

let selectedFile1 = null;
let selectedFile2 = null;
let lastAnalysisResults = null; // Store the results for PDF generation

// --- Event Listeners ---
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

setupEventListeners(dropZone1, fileInput1, (file) => handleFile(file, 1));
setupEventListeners(dropZone2, fileInput2, (file) => handleFile(file, 2));
analyzeButton.addEventListener('click', analyzeFiles);
generatePdfButton.addEventListener('click', generatePdfReport);


// --- Core Functions ---
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
    
    // Reset on new file selection
    lastAnalysisResults = null;
    generatePdfButton.disabled = true;
    manualInputSection.classList.add('hidden');
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
    manualInputSection.classList.add('hidden');
    resultsArea.innerHTML = '<p class="text-center text-slate-500">Analyzing... please wait.</p>';

    try {
        const parser = new DOMParser();
        
        const xmlString1 = await selectedFile1.text();
        const xmlDoc1 = parser.parseFromString(xmlString1, "application/xml");
        const paymentAuthData = parsePaymentAuthXML(xmlDoc1);

        const xmlString2 = await selectedFile2.text();
        const xmlDoc2 = parser.parseFromString(xmlString2, "application/xml");
        const sanctionTEData = parseSanctionTEDetailsXML(xmlDoc2);

        lastAnalysisResults = reconcileData(paymentAuthData, sanctionTEData);
        displayResults(lastAnalysisResults);
        
        // Pre-fill calculated percentage
        const { vNormalBills, vEBills, cNormalBills, cEBills } = lastAnalysisResults;
        const totalPassedEBills = vEBills.length + cEBills.length;
        const totalPassedBills = totalPassedEBills + vNormalBills.length + cNormalBills.length;
        const percentage = totalPassedBills > 0 ? ((totalPassedEBills / totalPassedBills) * 100).toFixed(2) : "0.00";
        document.getElementById('percentage-override').value = `${percentage}%`;


        generatePdfButton.disabled = false; // Enable PDF button on success
        manualInputSection.classList.remove('hidden'); // Show returned bills section

    } catch (error) {
        console.error('Analysis Error:', error);
        updateStatus(`Error: ${error.message}`, 'error');
        resultsArea.innerHTML = `<p class="text-center text-red-600">Failed to analyze files. Please check if the files are valid and not corrupted.<br><span class="text-sm">${error.message}</span></p>`;
    } finally {
        analyzeButton.disabled = false;
    }
}

function parsePaymentAuthXML(xmlDoc) {
    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse E-Payment Authorization Register. It may be corrupted.");
    }
    const allVouchers = [];
    const ddoNodes = Array.from(xmlDoc.getElementsByTagName('DDOCode'));

    for (const ddoNode of ddoNodes) {
        const ddoInfo = ddoNode.getAttribute('DDOCode') || '';
        const voucherNodes = Array.from(ddoNode.getElementsByTagName('VoucherNumber'));

        for (const voucher of voucherNodes) {
            const voucherNumberStr = String(voucher.getAttribute('VoucherNumber')).trim().split(/[\s\r\n]+/)[0];
            const detailsList = voucher.getElementsByTagName('Details');
            const isNormal = Array.from(detailsList).some(d => d.getAttribute('billType') === 'Normal');
            const billType = isNormal ? 'Normal' : 'e-Bill';
            
            let token = null;
            let userNm = null;

            if (isNormal) {
                const tokenEl = voucher.getElementsByTagName('TokenNumber')[0];
                token = tokenEl ? String(tokenEl.getAttribute('TokenNumber')).trim().split(/[\s\r\n]+/)[0] : null;
                const firstDetail = detailsList[0];
                userNm = firstDetail ? firstDetail.getAttribute('UserNm') : null;
            }
            
            if (voucherNumberStr) {
                allVouchers.push({ voucherNumber: voucherNumberStr, billType, token, userNm, ddoInfo });
            }
        }
    }
    
    const issueDateNode = xmlDoc.querySelector('IssueDate[IssueDate]');
    const issueDateAttr = issueDateNode ? issueDateNode.getAttribute('IssueDate') : '';
    const issueDate = issueDateAttr.replace('Issue Date:', '').trim().replace(/-/g, '/');

    return { vouchers: allVouchers, issueDate };
}

function parseSanctionTEDetailsXML(xmlDoc) {
    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse Sanction TE Details report. It may be corrupted.");
    }
    const instrumentNodes = Array.from(xmlDoc.getElementsByTagName('InstrumentNo'));
    const voucherDetailsMap = new Map();

    for (const node of instrumentNodes) {
        const instrumentNoAttr = node.getAttribute('InstrumentNo3');
        const voucherNumberMatch = instrumentNoAttr.match(/:\s*([VC]\d+)/);
        if (!voucherNumberMatch) continue;
        
        const voucherNumber = voucherNumberMatch[1];
        const detailNodes = Array.from(node.getElementsByTagName('Details2'));
        const objectHeads = new Set();
        const funcHeads = new Set();
        const genericTerms = /ELECTRONIC ADVICES|SUSPENSE|CHEQUES|DEFAULT|DEDUCTIONS|CONTRIBUTIONS|GST|PUBLIC ACCOUNT|OTHERS/i;

        for (const detail of detailNodes) {
            const objHeadAttr = detail.getAttribute('ObjectHead2');
            if (objHeadAttr) {
                const cleanedHead = objHeadAttr.split('-[')[0].trim().toUpperCase();
                if (cleanedHead && !genericTerms.test(cleanedHead)) {
                    objectHeads.add(cleanedHead);
                }
            }

            const funcHeadAttr = detail.getAttribute('FuncHead2');
            if (funcHeadAttr) {
                const cleanedHead = funcHeadAttr.split('-[')[0].trim().toUpperCase();
                if (cleanedHead && !genericTerms.test(cleanedHead)) {
                    funcHeads.add(cleanedHead);
                }
            }
        }
        
        voucherDetailsMap.set(voucherNumber, { 
            objectHeads: Array.from(objectHeads), 
            funcHeads: Array.from(funcHeads) 
        });
    }
    return voucherDetailsMap;
}

function getCategory(voucher, sanctionTEData) {
    const { userNm, ddoInfo, voucherNumber } = voucher;

    if (userNm && userNm.includes('[GEM]')) {
        const isOuterDDO = /JAMMU|SRINAGAR|CHANDIGARH|DEHRADUN/i.test(ddoInfo);
        if (isOuterDDO) return 'Gem(Outer)';
    }

    if (userNm) {
        if (userNm.includes('[GPFEIS]')) return 'GPF';
        if (userNm.includes('[EIS]')) return 'Salary(EIS)';
        if (userNm.includes('[GEM]')) return 'Gem'; 
    }

    const details = sanctionTEData.get(voucherNumber);
    if (details) {
        if (details.objectHeads.length > 0) return details.objectHeads.join(', ');
        if (details.funcHeads.length > 0) return details.funcHeads.join(', ');
    }

    return 'Category Not Found';
}

function reconcileData(paymentAuthData, sanctionTEData) {
    let vNormalBills = [], vEBills = [], cNormalBills = [], cEBills = [];

    for (const voucher of paymentAuthData.vouchers) {
        if (voucher.billType === 'Normal') {
            voucher.category = getCategory(voucher, sanctionTEData);
        }

        if (voucher.voucherNumber.startsWith('V')) {
            if (voucher.billType === 'Normal') vNormalBills.push(voucher);
            else vEBills.push(voucher);
        } else if (voucher.voucherNumber.startsWith('C')) {
            if (voucher.billType === 'Normal') cNormalBills.push(voucher);
            else cEBills.push(voucher);
        }
    }
    
    const sortByToken = (a, b) => (a.token || 0) - (b.token || 0);
    vNormalBills.sort(sortByToken);
    cNormalBills.sort(sortByToken);

    return { vNormalBills, vEBills, cNormalBills, cEBills, issueDate: paymentAuthData.issueDate };
}

function displayResults(results) {
    const { vNormalBills, vEBills, cNormalBills, cEBills } = results;
    
    let resultsHTML = '';
    const totalVouchers = vNormalBills.length + vEBills.length + cNormalBills.length + cEBills.length;

    const createResultCard = (title, normalBills, eBillCount) => {
        const totalCount = normalBills.length + eBillCount;
        if (totalCount === 0) return '';

        let tokenHTML = '';
        if (normalBills.length > 0) {
            tokenHTML += `<div class="mt-4 pt-3 border-t border-slate-200">
                            <h4 class="font-semibold text-slate-600 mb-2">Categorized Normal Bills</h4>`;
            tokenHTML += `<div class="space-y-2">
                ${normalBills.map(bill => `
                    <div class="flex items-start gap-3 p-2 bg-white rounded-md border border-slate-200">
                        <span class="bg-blue-100 text-blue-800 text-xs font-mono font-medium px-2.5 py-1 rounded-full mt-0.5">${bill.token || 'N/A'}</span>
                        <div class="flex-1 text-sm">
                            <span class="font-medium text-slate-800">${bill.category}</span>
                            <span class="text-slate-500 text-xs block">(${bill.voucherNumber})</span>
                        </div>
                    </div>
                `).join('')}
            </div>`;
            tokenHTML += `</div>`;
        }

        return `
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-4 animate-fade-in">
                <h3 class="text-lg font-bold text-slate-700 mb-3">${title}</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between items-center"><span class="text-slate-600">Total Vouchers Found:</span><span class="font-bold text-slate-800 text-base">${totalCount}</span></div>
                    <div class="flex justify-between items-center pl-4"><span class="text-slate-500">- Normal Bills:</span><span class="font-medium text-slate-600">${normalBills.length}</span></div>
                    <div class="flex justify-between items-center pl-4"><span class="text-slate-500">- e-Bills:</span><span class="font-medium text-slate-600">${eBillCount}</span></div>
                </div>
                ${tokenHTML}
            </div>`;
    };

    resultsHTML += createResultCard("NCDDO Analysis (V Vouchers)", vNormalBills, vEBills.length);
    resultsHTML += createResultCard("CDDO Analysis (C Vouchers)", cNormalBills, cEBills.length);

    if (totalVouchers === 0) {
        resultsHTML = `<div class="text-center py-10 animate-fade-in">
                <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <h3 class="mt-2 text-lg font-medium text-slate-800">No Vouchers Found</h3>
                <p class="mt-1 text-sm text-slate-500">The analyzer could not find any vouchers in the provided files.</p>
            </div>`;
    }

    resultsArea.innerHTML = resultsHTML;
    updateStatus('Analysis complete.', 'success');
}

function generatePdfReport() {
    if (!lastAnalysisResults) {
        alert("Please analyze the reports first before generating a PDF.");
        return;
    }

    // FIX: Use the more direct constructor call to prevent initialization errors.
    const doc = new window.jspdf.jsPDF();
    const { vNormalBills, vEBills, cNormalBills, cEBills, issueDate } = lastAnalysisResults;

    // --- Data Preparation ---
    const reportDate = issueDate || new Date().toLocaleDateString('en-GB');
    const getInputValue = (id) => {
        const value = parseInt(document.getElementById(id).value, 10) || 0;
        return Math.max(0, value); // Ensure value is not negative
    };

    const data = {
        eBillsNCDDO: { passed: vEBills.length, returned: getInputValue('returned-ebills-ncddo') },
        eBillsCDDO: { passed: cEBills.length, returned: getInputValue('returned-ebills-cddo') },
        normalBillsNCDDO: { passed: vNormalBills.length, returned: getInputValue('returned-normal-ncddo') },
        normalBillsCDDO: { passed: cNormalBills.length, returned: getInputValue('returned-normal-cddo') },
    };

    const getRemarks = (bills) => {
        if (bills.length === 0) return '';
        const counts = bills.reduce((acc, bill) => {
            acc[bill.category] = (acc[bill.category] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([cat, count]) => `${cat}: ${count}`).join(', ');
    };

    data.normalBillsNCDDO.remarks = getRemarks(vNormalBills);
    data.normalBillsCDDO.remarks = getRemarks(cNormalBills);

    let percentage = document.getElementById('percentage-override').value.trim();
    if (percentage && !percentage.endsWith('%')) {
        percentage += '%';
    }

    // --- PDF Generation ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("PAO, GSI(NR),Lucknow", 105, 20, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Daily Status Report of E. Bills", 105, 27, { align: "center" });
    doc.text(`Date: ${reportDate}`, 20, 40);

    const tableX = 20;
    const tableY = 50;
    const rowHeight = 20;
    const colWidths = [60, 25, 25, 25, 35];
    const headers = ["Type of Bills", "Passed", "Returned", "Total", "Remarks"];

    doc.setFont("helvetica", "bold");
    headers.forEach((header, i) => {
        const xPos = tableX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.rect(xPos, tableY, colWidths[i], 10);
        doc.text(header, xPos + colWidths[i] / 2, tableY + 6, { align: "center" });
    });

    doc.setFont("helvetica", "normal");
    const rows = [
        ["E. Bills- NCDDO", data.eBillsNCDDO.passed, data.eBillsNCDDO.returned, data.eBillsNCDDO.passed + data.eBillsNCDDO.returned, ""],
        ["E. Bills- CDDO", data.eBillsCDDO.passed, data.eBillsCDDO.returned, data.eBillsCDDO.passed + data.eBillsCDDO.returned, ""],
        ["Normal Bills- NCDDO", data.normalBillsNCDDO.passed, data.normalBillsNCDDO.returned, data.normalBillsNCDDO.passed + data.normalBillsNCDDO.returned, data.normalBillsNCDDO.remarks],
        ["Normal Bills- CDDO", data.normalBillsCDDO.passed, data.normalBillsCDDO.returned, data.normalBillsCDDO.passed + data.normalBillsCDDO.returned, data.normalBillsCDDO.remarks],
    ];

    rows.forEach((row, rowIndex) => {
        const yPos = tableY + 10 + (rowIndex * rowHeight);
        row.forEach((cell, colIndex) => {
            const xPos = tableX + colWidths.slice(0, colIndex).reduce((a, b) => a + b, 0);
            doc.rect(xPos, yPos, colWidths[colIndex], rowHeight);
            if (colIndex === 4) {
                 const textLines = doc.splitTextToSize(String(cell), colWidths[colIndex] - 4);
                 doc.text(textLines, xPos + 2, yPos + 5);
            } else {
                 doc.text(String(cell), xPos + colWidths[colIndex] / 2, yPos + rowHeight / 2, { align: "center" });
            }
        });
    });

    doc.setFont("helvetica", "bold");
    doc.text(`Percentage of E. Bills being passed: ${percentage}`, 20, tableY + 10 + (4 * rowHeight) + 10);
    
    doc.setFont("helvetica", "normal");
    doc.text("Sr. Account Officer", 180, tableY + 10 + (4 * rowHeight) + 30, { align: "right" });
    doc.text("PAO, GSI(NR)", 180, tableY + 10 + (4 * rowHeight) + 35, { align: "right" });
    doc.text("Lucknow", 180, tableY + 10 + (4 * rowHeight) + 40, { align: "right" });

    doc.save(`Daily_Status_Report_${reportDate.replace(/\//g, '-')}.pdf`);
}