// ============================================================
// TIDE Monitor UI — live processing overlay for TIDE analysis
// ============================================================

var TIDE_MONITOR = (function () {
    var modal, titleEl, typeBadge, progressFill, progressText, statusText,
        chunksEl, findingsEl, newFindingsEl, cancelBtn, closeBtn;
    var totalFindings = 0;
    var runFindings = 0;
    var active = false;

    function cache() {
        modal = document.getElementById('tideMonitorModal');
        titleEl = document.getElementById('tideMonitorTitle');
        typeBadge = document.getElementById('tideMonitorType');
        progressFill = document.getElementById('tideMonitorProgressFill');
        progressText = document.getElementById('tideMonitorProgressText');
        statusText = document.getElementById('tideMonitorStatusText');
        chunksEl = document.getElementById('tideMonitorChunksDone');
        findingsEl = document.getElementById('tideMonitorFindingsCount');
        newFindingsEl = document.getElementById('tideMonitorRunFindings');
        cancelBtn = document.getElementById('tideMonitorCancelBtn');
        closeBtn = document.getElementById('tideMonitorCloseBtn');
    }

    function show(typeName, totalChunks) {
        cache();
        if (!modal) return;
        active = true;
        totalFindings = 0;
        runFindings = 0;

        modal.classList.add('active');

        var icon = document.getElementById('tideMonitorIcon');
        if (icon) {
            icon.classList.remove('done');
            icon.classList.add('processing');
            icon.innerHTML = '<div class="loader" style="--size:28px;margin:0 auto;"></div>';
        }

        if (titleEl) titleEl.textContent = 'TIDE Active Scan';
        if (typeBadge) typeBadge.style.display = 'none';

        updateProgress(0, totalChunks || 1, 'Initializing...');
        setFindingsCount(0, 0);

        if (cancelBtn) cancelBtn.style.display = 'inline-flex';
        if (closeBtn) closeBtn.style.display = 'none';

        var progressContainer = document.getElementById('tideMonitorProgressContainer');
        var summaryContainer = document.getElementById('tideMonitorSummary');
        if (progressContainer) progressContainer.style.display = 'block';
        if (summaryContainer) summaryContainer.style.display = 'none';
    }

    function updateProgress(processed, total, label) {
        if (!active) return;
        var pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
        if (progressFill) progressFill.style.width = pct + '%';
        if (progressText) progressText.textContent = processed + ' / ' + total + ' chunks';
        if (statusText) statusText.textContent = label || 'Processing...';
        if (chunksEl) chunksEl.textContent = processed + ' / ' + total;
    }

    function setFindingsCount(total, run) {
        if (findingsEl) findingsEl.textContent = total;
        if (newFindingsEl) newFindingsEl.textContent = run;
    }

    function addFindings(count) {
        totalFindings += count;
        runFindings += count;
        setFindingsCount(totalFindings, runFindings);
    }

    function setStatus(text) {
        if (statusText) statusText.textContent = text;
    }

    function complete(summary) {
        if (!modal) return;
        active = false;

        var icon = document.getElementById('tideMonitorIcon');
        if (icon) {
            icon.classList.remove('processing');
            icon.classList.add('done');
            icon.innerHTML = '<i class="fas fa-check"></i>';
        }

        if (titleEl) titleEl.textContent = 'Analysis Complete';
        if (typeBadge) typeBadge.style.display = 'none';

        var progressContainer = document.getElementById('tideMonitorProgressContainer');
        var summaryContainer = document.getElementById('tideMonitorSummary');

        if (progressContainer) progressContainer.style.display = 'none';
        if (summaryContainer) {
            summaryContainer.style.display = 'block';
            var totalChunks = summary.totalChunks || 0;
            var totalFindingsVal = summary.totalFindings || totalFindings;
            var summaryHtml = document.getElementById('tideMonitorSummaryText');
            if (summaryHtml) {
                var lines = [];
                if (summary.chunksText) lines.push(summary.chunksText);
                if (summary.typesText) lines.push(summary.typesText);
                if (summary.detailText) lines.push(summary.detailText);
                summaryHtml.innerHTML = lines.join('<br>') || 'Processed ' + totalChunks + ' chunks, ' + totalFindingsVal + ' findings.';
            }
        }

        if (cancelBtn) cancelBtn.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'inline-flex';
    }

    function hide() {
        if (modal) modal.classList.remove('active');
        active = false;
    }

    function isActive() {
        return active;
    }

    function cancel() {
        if (window.TIDE_INSTANCE) {
            window.TIDE_INSTANCE.cancel();
        }
        setStatus('Cancelling...');
        if (cancelBtn) cancelBtn.disabled = true;
        setTimeout(function () {
            hide();
            if (cancelBtn) cancelBtn.disabled = false;
        }, 500);
    }

    cache();

    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancel);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', hide);
    }

    return {
        show: show,
        updateProgress: updateProgress,
        setFindingsCount: setFindingsCount,
        addFindings: addFindings,
        setStatus: setStatus,
        complete: complete,
        hide: hide,
        isActive: isActive,
        cancel: cancel
    };
})();
