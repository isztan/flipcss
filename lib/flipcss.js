/* jshint: */
/*global module buster flipcss:true public_functions:true*/

var flipcss = {
    /**
     * Pattern matching rules to ignore (marked with "!direction-ignore" in a
     * comment)
     *
     * This pattern is to be added to other patterns that matches a full CSS
     * rule.
     *
     * Note: This regexp does not match the end of the comment, allowing extra
     * text to follow the meta information. This regexp is not used to delete
     * rules.
     *
     * (?!y) -> not followed by y.
     * @private
     */
    _ruleMatchIgnorePattern: "(?![^\n]*/\\*\\s*!"
                           + "(direction-ignore|rtl-only|ltr-only)"
                           + ")",


    /**
     * Swap two words in a string
     *
     * @private
     * @param {String} string String to process
     * @param {String} word1 Word to swap with word2
     * @param {String} word2 Word to swap with word1
     * @returns {String} Processed string.
     *
     * NOTE: This function is stupid; word1 and word2 are expected to be
     * alphanumeric characters, but no checking is performed, so it may
     * break on other strings.
     */
    _swapWords: function(string, word1, word2) {
        // Matches one of the given words, nothing else (i.e. the rest of the
        // rule is ignored), except ignore pattern.
        // Captures the found word.
        var pattern = new RegExp(
              "([^a-z0-9])(" + word1 + "|" + word2 + ")([^a-z0-9])"
            + this._ruleMatchIgnorePattern, "g");

        return string.replace(pattern, function(_, pre, word, post) {
            return pre + (word === word1 ? word2 : word1) + post;
        });
    },


    /**
     * Swap left/right values in four-value rules.
     * Example:
     *    margin: 1px 2px 3px 4px   --->   margin: 1px 4px 3px 2px
     *
     * @private
     * @param {String} string String to process
     * @returns {String} Processed string
     */
    _swapValues: function(string) {
        // Matches pattern and margin rules, including semicolon and ignore
        // pattern.
        // Captures all parts, except whitespace and semicolon.
        var pattern = new RegExp(
              "(padding|margin):\\s*"
            // Optional number and dot, then number and units (0-3 letters),
            // followed by whitespace.
            + "((?:\\d*\\.)?\\d+[a-z%]{0,3})\\s+"
            + "((?:\\d*\\.)?\\d+[a-z%]{0,3})\\s+"
            + "((?:\\d*\\.)?\\d+[a-z%]{0,3})\\s+"
            + "((?:\\d*\\.)?\\d+[a-z%]{0,3})\\s*"
            + "(.*);"
            + this._ruleMatchIgnorePattern, "g");

        return string.replace(pattern, function(_, prop, d1, d2, d3, d4, d5) {
            return prop + ": " + d1 + " " + d4 + " " + d3 + " " + d2
                + (d5 ? " " + d5 : "")
                + ";";
        });
    },


    /**
     * Swap left/right values for background position.
     * Example:
     *     background:url("@{image-url}/foo.bar") 0% 0 no-repeat;  --->
     *     background:url("@{image-url}/foo.bar") 100% 0 no-repeat;  --->
     *
     * Note: positions given as strings ("left"/"right") are handled
     * by _swapWords().
     *
     * @private
     * @param {String} string String to process
     * @returns {String} Processed string
     */
    _swapBackgroundPosition: function(string) {
        // Matches background and background-position rules.
        // Captures everything, except semi-colon
        var pattern = new RegExp(
              "(background(?:-position)?):(.*);"
            + this._ruleMatchIgnorePattern, "g");

        return string.replace(pattern, function(_, prop, d1) {
            // Split string into parts, and operate on each part.
            // Only first of x,y value pair should be inverted, and only if:
            // * given as a positive percentage value, or "0"
            // * not inside parenteses
            var parts = d1.trim().split(/\s+/);
            var insideParentheses = false;

            for (var i=0; i<parts.length; i++) {
                var p = parts[i];

                // Ignore everything between parenteses
                if (-1 < p.indexOf("(") && -1 === p.indexOf(")")) {
                    insideParentheses = true;
                    continue;
                } else if (-1 < p.indexOf(")")) {
                    insideParentheses = false;
                    continue;
                }
                if (insideParentheses) continue;

                // Pattern to match everything except values with percentages
                pattern = /^(?:(?:\d*\.)?\d+[a-z]{2,3}|center|left|right)$/;

                // If pattern is matched, or a negative value is found, no
                // values should be flipped.
                if (p.match(pattern) !== null || 0 === p.indexOf("-")) {
                    break;
                } else if (-1 < p.indexOf("%") || "0" === p) {
                    parts[i] = (100 - parseFloat(p)) + "%";
                    break;
                }
            }
            return prop + ": " + parts.join(" ") + ";";
        });
    },

    /**
     * Add a CSS rule inside a given CSS group. If the group does not exist,
     * it is created.
     *
     * Note: This function is not very smart. It looks for the first occurence
     * of the group, then inserts. The group param is inserted to a regex, but
     * only the "*" character is escaped.
     *
     * @private
     * @param {String} string String to process.
     * @param {String} group CSS group to insert into
     * @param {String} rule CSS rule to insert
     * @returns {String} Processed string
     */

    _addRule: function(string, group, rule) {
        // Abort if group and/or rule is empty
        if (0 === group.length || 0 === rule.length) return string;

        // escape star char from group name
        var esc_group = group.replace("*", "\\*");

        var newString = ""
        ,   regex = new RegExp("(?:^|\\})\\s*" + esc_group + "\\s*\\{", "g")
        ,   result = null;
        result = regex.exec(string);

        if (result && 0 <= result.index) {
            var pos = result.index + result[0].length;
            newString = [string.substring(0, pos),
                         rule + ";",
                         string.substring(pos)
                        ].join("");
        } else {
            newString = group + "{" + rule + ";}"  + string;
        }
        // Find end position, keep count of opening/closing tags

        return newString;
    },

    /*
     * Delete rule based on trailing comment
     *
     * @param {String} string CSS string
     * @param {String} tail Trailing comment
     * @returns {String} Processed string
     */
    _deleteRule: function(string, tail) {
        var regexp = new RegExp("[^;:\\s]+\\s*:\\s*[^;:]+;\\s*/\\*\\s*"
                                + tail + ".*\\*/", "g");

        return string.replace(regexp, "");
    },

    /**
     * Find all inline elements
     *
     * @private
     * @param {String} string String to process
     * @returns {Array} Indexes of matches
     */
    _findInline: function(string) {
        var matches = []
        ,   result = null;

        var regex = /display\s*:\s*inline\s*;/g;
        while((result = regex.exec(string))) {
            matches.push(result.index);
        }

        return matches;
    },

    /**
     * Remove line feeds before meta comments.
     *
     * This is useful when CSS has been compiled/automatically generated (e.g.
     * by Less) and line feeds have been added before the meta comments.
     *
     * @param {String} string CSS string
     * @returns {String} Processed string
     */
    _cleanLineFeeds: function(string) {
        var regexp = "(/\\*\\s*?"
                   + "(!direction-ignore|!rtl-only|!ltr-only)"
                   + ")";

        var pattern = new RegExp("(;.*?)(\r\n|\n)(\\s*?)"
            + regexp, "g");

        return string.replace(pattern, function(_, pre, lf, post, ig) {
            return pre + post + ig;
        });
    }
};

module.exports = {
    /**
     * Turn a rtl stylesheet to a ltr one, and vice versa.
     *
     * This means making the visuals change direction, like in mirroring
     * the content; floats will be floated the other way, etc.
     *
     * @param {String} string CSS string to flip.
     * @param {Boolean} warnings Output warnings.
     * @returns {String} Flipped CSS.
     */
    flip: function(string, warnings) {
        if (!warnings) warnings = false;

        // Output warnings:
        if (warnings) {
            var matches = flipcss._findInline(string);
            for (var i=0; i<matches.length; i++) {
                console.log("Warning: Inline element found at char "
                            + matches[i]
                           );
            }
        }

        // Do preprocessing
        string = flipcss._cleanLineFeeds(string);

        // Do processing
        string = flipcss._swapWords(string, "left", "right");
        string = flipcss._swapValues(string);
        string = flipcss._swapBackgroundPosition(string);

        return string;
    },

    /**
     * Clean out CSS rules not intended for a specific direction.
     *
     * Some CSS rules should only be for left-to-right (ltr) stylesheets,
     * and some only for right-to-left (rtl) ones. These can be cleaned out.
     * Example:
     *
     *   clean("font-style: italic; \/\* !ltr-only \*\/", "rtl");
     *       --> Rule will be removed from output
     *
     *   clean("font-style: italic; \/\* !ltr-only \*\/", "ltr");
     *       --> Rule will be kept in output
     *
     * (Note: Comment should be regular CSS comment.)
     *
     * Given that you have both ltr and rtl specific rules, and your original
     * CSS is ltr, you will have to run clean on both the original and on the
     * generated rtl output.
     *
     * @param {String} string CSS string to clean.
     * @param {String} dir Direction of the output ("rtl" or "ltr").
     * @returns {String} Cleaned CSS.
     */
    clean: function(string, dir) {
        // Do preprocessing
        string = flipcss._cleanLineFeeds(string);

        // Do processing
        if ("rtl" === dir || "ltr" === dir) {
            // If preprocess rtl, remove ltr-only rules and vice versa.
            var str = (dir === "rtl") ? "ltr" : "rtl";
            string = flipcss._deleteRule(string, "!" + str + "-only");
            string = flipcss._addRule(string, "body", "direction:" + dir );
        }
        return string;
    }
};
