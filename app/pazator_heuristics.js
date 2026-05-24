(function () {
    'use strict';

    function levenshteinDistance(s1, s2) {
        s1 = (s1 || '').toLowerCase().trim();
        s2 = (s2 || '').toLowerCase().trim();
        if (s1 === s2) return 0;
        if (s1.length === 0) return s2.length;
        if (s2.length === 0) return s1.length;

        var matrix = [];
        var i, j;
        for (i = 0; i <= s2.length; i++) {
            matrix[i] = [i];
        }
        for (j = 0; j <= s1.length; j++) {
            matrix[0][j] = j;
        }

        for (i = 1; i <= s2.length; i++) {
            for (j = 1; j <= s1.length; j++) {
                if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        Math.min(
                            matrix[i][j - 1] + 1, // insertion
                            matrix[i - 1][j] + 1  // deletion
                        )
                    );
                }
            }
        }
        return matrix[s2.length][s1.length];
    }

    function nameSimilarity(n1, n2) {
        var distance = levenshteinDistance(n1, n2);
        var maxLen = Math.max(n1.length, n2.length);
        if (maxLen === 0) return 0;
        return (maxLen - distance) / maxLen;
    }

    function checkSharedAttributes(p1, p2) {
        var shared = [];
        var fields = [
            { key: 'workplace', label: 'Workplace' },
            { key: 'nationality', label: 'Nationality' },
            { key: 'countryOfOrigin', label: 'Country of Origin' },
            { key: 'religion', label: 'Religion' },
            { key: 'politicalViews', label: 'Political Views' },
            { key: 'ethnicity', label: 'Ethnicity' },
            { key: 'immigrationStatus', label: 'Immigration Status' },
            { key: 'maritalStatus', label: 'Marital Status' },
            { key: 'socialClass', label: 'Social Class' },
            { key: 'incomeLevel', label: 'Income Level' },
            { key: 'educationLevel', label: 'Education Level' }
        ];

        fields.forEach(function (f) {
            var v1 = (p1[f.key] || '').toString().toLowerCase().trim();
            var v2 = (p2[f.key] || '').toString().toLowerCase().trim();
            if (v1 && v2 && v1 === v2) {
                shared.push({ field: f.label, value: p1[f.key] });
            }
        });
        return shared;
    }

    function checkBirthDateSimilarity(p1, p2) {
        var d1 = p1.birthDate || '';
        var d2 = p2.birthDate || '';
        if (!d1 || !d2) return { match: false, reason: '' };
        if (d1 === d2) return { match: true, score: 30, reason: 'Exact birthdate match (' + d1 + ')' };

        // Check same month & day but different year
        var parts1 = d1.split('-');
        var parts2 = d2.split('-');
        if (parts1.length === 3 && parts2.length === 3) {
            if (parts1[1] === parts2[1] && parts1[2] === parts2[2]) {
                return { match: true, score: 15, reason: 'Same birth month/day (' + parts1[1] + '-' + parts1[2] + ') but different year' };
            }
        }
        return { match: false, reason: '' };
    }

    function scan(people) {
        people = people || window.pazatorData?.humans || [];
        var results = [];
        var len = people.length;

        for (var i = 0; i < len; i++) {
            for (var j = i + 1; j < len; j++) {
                var p1 = people[i];
                var p2 = people[j];

                var score = 0;
                var reasons = [];

                // 1. Name Match Heuristic
                var nameSim = nameSimilarity(p1.name, p2.name);
                if (nameSim >= 0.8) {
                    var pct = Math.round(nameSim * 100);
                    score += nameSim * 45; // up to 45 points
                    reasons.push('High name similarity (' + pct + '% match: "' + p1.name + '" vs "' + p2.name + '")');
                } else if (nameSim >= 0.6) {
                    var pct = Math.round(nameSim * 100);
                    score += nameSim * 20;
                    reasons.push('Moderate name similarity (' + pct + '% match)');
                }

                // 2. BirthDate Heuristic
                var dobMatch = checkBirthDateSimilarity(p1, p2);
                if (dobMatch.match) {
                    score += dobMatch.score;
                    reasons.push(dobMatch.reason);
                }

                // 3. Shared Attributes Heuristic
                var sharedAttrs = checkSharedAttributes(p1, p2);
                if (sharedAttrs.length >= 3) {
                    score += Math.min(sharedAttrs.length * 10, 40); // up to 40 points
                    var attrLabels = sharedAttrs.map(function (a) { return a.field + ' ("' + a.value + '")'; });
                    reasons.push('Significant attribute correlation (shares ' + sharedAttrs.length + ' fields: ' + attrLabels.join(', ') + ')');
                } else if (sharedAttrs.length > 0) {
                    score += sharedAttrs.length * 3;
                    var attrLabels = sharedAttrs.map(function (a) { return a.field; });
                    reasons.push('Shared attributes: ' + attrLabels.join(', '));
                }

                // 4. Contact/Friend Cross-reference Heuristic
                var friends1 = p1.friends || [];
                var friends2 = p2.friends || [];
                var commonFriends = friends1.filter(function (f) { return friends2.indexOf(f) !== -1; });
                if (commonFriends.length > 0) {
                    score += Math.min(commonFriends.length * 8, 25);
                    reasons.push('Shared social circle (' + commonFriends.length + ' mutual connections)');
                }

                // Caps and normalization
                score = Math.min(Math.round(score), 100);

                // Flag if match probability is moderate or high (>= 40)
                if (score >= 40) {
                    results.push({
                        person1: { id: p1.id, name: p1.name, threatLevel: p1.threatLevel || 'None' },
                        person2: { id: p2.id, name: p2.name, threatLevel: p2.threatLevel || 'None' },
                        score: score,
                        reasons: reasons
                    });
                }
            }
        }

        return results.sort(function (a, b) { return b.score - a.score; });
    }

    window.pazatorHeuristics = {
        scan: scan,
        levenshtein: levenshteinDistance,
        similarity: nameSimilarity
    };
})();
