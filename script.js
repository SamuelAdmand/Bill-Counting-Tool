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
        
        // File 1: E-Payment Register (Lookup file)
        const xmlString1 = await selectedFile1.text();
        const xmlDoc1 = parser.parseFromString(xmlString1, "application/xml");
        const paymentAuthData = parsePaymentAuthXML(xmlDoc1);

        // File 2: Compilation Sheet (Main source file)
        const xmlString2 = await selectedFile2.text();
        const xmlDoc2 = parser.parseFromString(xmlString2, "application/xml");
        const compilationData = parseCompilationSheetXML(xmlDoc2);

        // Use compilation sheet date as primary, fallback to e-payment date
        const reportDate = compilationData.reportDate || paymentAuthData.issueDate;

        lastAnalysisResults = reconcileData(compilationData.vouchers, paymentAuthData.voucherDetailsMap, reportDate);
        displayResults(lastAnalysisResults);
        
        // Pre-fill calculated percentage
        const { ncddoNormalBills, ncddoEBills, cddoNormalBills, cddoEBills } = lastAnalysisResults;
        const totalPassedEBills = ncddoEBills.length + cddoEBills.length;
        const totalPassedBills = totalPassedEBills + ncddoNormalBills.length + cddoNormalBills.length;
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
        throw new Error("Failed to parse Voucher Compilation Sheet. It may be corrupted.");
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
                const objHeadAttr = detail.getAttribute('ObjectHead');
                if (objHeadAttr) {
                    const cleanedHead = objHeadAttr.split(' [')[0].trim().toUpperCase();
                    if (cleanedHead && !genericTerms.test(cleanedHead)) {
                        objectHeads.add(cleanedHead);
                    }
                }
                const funcHeadAttr = detail.getAttribute('FuncHead');
                 if (funcHeadAttr) {
                    const cleanedHead = funcHeadAttr.split(' [')[0].trim().toUpperCase();
                    if (cleanedHead && !genericTerms.test(cleanedHead)) {
                        funcHeads.add(cleanedHead);
                    }
                }
            }
            allVouchers.push({
                voucherNumber,
                ddoName,
                objectHeads: Array.from(objectHeads),
                funcHeads: Array.from(funcHeads)
            });
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


function getCategory(voucher) {
    const { userNm, objectHeads, funcHeads } = voucher;

    if (userNm) {
        if (userNm.includes('[GPFEIS]')) return 'GPF';
        if (userNm.includes('[EIS]')) return 'Salary(EIS)';
        if (userNm.includes('[GEM]')) return 'Gem';
        if (userNm.includes('[Pension]')) return 'Pension';
    }

    if (objectHeads && objectHeads.length > 0) {
        return objectHeads.join(', ');
    }
    if (funcHeads && funcHeads.length > 0) {
        return funcHeads.join(', ');
    }

    return 'Category Not Found';
}

function reconcileData(compilationVouchers, paymentAuthMap, issueDate) {
    let ncddoNormalBills = [], ncddoEBills = [], cddoNormalBills = [], cddoEBills = [];

    for (const voucher of compilationVouchers) {
        const paymentDetails = paymentAuthMap.get(voucher.voucherNumber);

        // Assign details from lookup or set defaults
        voucher.billType = paymentDetails ? paymentDetails.billType : 'Normal';
        voucher.userNm = paymentDetails ? paymentDetails.userNm : null;
        voucher.token = paymentDetails ? paymentDetails.token : null;
        voucher.category = getCategory(voucher);

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

function displayResults(results) {
    const { ncddoNormalBills, ncddoEBills, cddoNormalBills, cddoEBills } = results;
    
    let resultsHTML = '';
    const totalVouchers = ncddoNormalBills.length + ncddoEBills.length + cddoNormalBills.length + cddoEBills.length;

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

    resultsHTML += createResultCard("NCDDO Analysis (Lucknow)", ncddoNormalBills, ncddoEBills.length);
    resultsHTML += createResultCard("CDDO Analysis (Outer)", cddoNormalBills, cddoEBills.length);

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

    const doc = new window.jspdf.jsPDF();
    const { ncddoNormalBills, ncddoEBills, cddoNormalBills, cddoEBills, issueDate } = lastAnalysisResults;

    // --- Data Preparation ---
    const reportDate = issueDate || new Date().toLocaleDateString('en-GB');
    const getInputValue = (id) => {
        const value = parseInt(document.getElementById(id).value, 10) || 0;
        return Math.max(0, value); // Ensure value is not negative
    };

    const data = {
        eBillsNCDDO: { passed: ncddoEBills.length, returned: getInputValue('returned-ebills-ncddo') },
        eBillsCDDO: { passed: cddoEBills.length, returned: getInputValue('returned-ebills-cddo') },
        normalBillsNCDDO: { passed: ncddoNormalBills.length, returned: getInputValue('returned-normal-ncddo') },
        normalBillsCDDO: { passed: cddoNormalBills.length, returned: getInputValue('returned-normal-cddo') },
    };

    const getRemarks = (bills) => {
        if (bills.length === 0) return '';
        const counts = bills.reduce((acc, bill) => {
            acc[bill.category] = (acc[bill.category] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([cat, count]) => `${cat}: ${count}`).join(', ');
    };

    data.normalBillsNCDDO.remarks = getRemarks(ncddoNormalBills);
    data.normalBillsCDDO.remarks = getRemarks(cddoNormalBills);

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
    const headerY = 50;
    const colWidths = [60, 25, 25, 25, 35];
    const headers = ["Type of Bills", "Passed", "Returned", "Total", "Remarks"];
    const headerHeight = 10;
    const verticalPadding = 5;
    const lineHeight = 5; // Approximate height for a line of text

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
        ["Normal Bills- NCDDO", data.normalBillsNCDDO.passed, data.normalBillsNCDDO.returned, data.normalBillsNCDDO.passed + data.normalBillsNCDDO.returned, data.normalBillsNCDDO.remarks],
        ["Normal Bills- CDDO", data.normalBillsCDDO.passed, data.normalBillsCDDO.returned, data.normalBillsCDDO.passed + data.normalBillsCDDO.returned, data.normalBillsCDDO.remarks],
    ];

    let currentY = headerY + headerHeight;

    rows.forEach((row) => {
        // Calculate dynamic row height based on remarks column
        const remarksText = String(row[4]);
        const textLines = doc.splitTextToSize(remarksText, colWidths[4] - 4);
        const calculatedHeight = (textLines.length * lineHeight) + (verticalPadding * 2);
        const rowHeight = Math.max(15, calculatedHeight); // Set a minimum row height

        row.forEach((cell, colIndex) => {
            const xPos = tableX + colWidths.slice(0, colIndex).reduce((a, b) => a + b, 0);
            doc.rect(xPos, currentY, colWidths[colIndex], rowHeight);
            
            if (colIndex === 4) { // Remarks column with wrapping
                 doc.text(textLines, xPos + 2, currentY + verticalPadding);
            } else { // Other columns, vertically centered
                 doc.text(String(cell), xPos + colWidths[colIndex] / 2, currentY + rowHeight / 2 + 2, { align: "center" });
            }
        });
        currentY += rowHeight;
    });

    // Footer position is now dynamic
    const footerY = currentY + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Percentage of E. Bills being passed: ${percentage}`, 20, footerY);
    
    doc.setFont("helvetica", "normal");
    doc.text("Sr. Account Officer", 190, footerY + 20, { align: "right" });
    doc.text("PAO, GSI(NR)", 190, footerY + 25, { align: "right" });
    doc.text("Lucknow", 190, footerY + 30, { align: "right" });

    doc.save(`Daily_Status_Report_${reportDate.replace(/\//g, '-')}.pdf`);
}