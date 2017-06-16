/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const ByteEfficiencyAudit = require('./byte-efficiency-audit');
const URL = require('../../lib/url-shim');

const PREVIEW_LENGTH = 100;

class UnusedCSSRules extends ByteEfficiencyAudit {
  /**
   * @return {!AuditMeta}
   */
  static get meta() {
    return {
      category: 'CSS',
      name: 'unused-css-rules',
      description: 'Unused CSS rules',
      informative: true,
      helpText: 'Remove unused rules from stylesheets to reduce unnecessary ' +
          'bytes consumed by network activity. ' +
          '[Learn more](https://developers.google.com/speed/docs/insights/OptimizeCSSDelivery)',
      requiredArtifacts: ['CSSUsage', 'Styles', 'URL', 'devtoolsLogs']
    };
  }

  /**
   * @param {!Array.<{header: {styleSheetId: string}}>} styles The output of the Styles gatherer.
   * @param {!Array<WebInspector.NetworkRequest>} networkRecords
   * @return {!Object} A map of styleSheetId to stylesheet information.
   */
  static indexStylesheetsById(styles, networkRecords) {
    const indexedNetworkRecords = networkRecords
        .filter(record => record._resourceType && record._resourceType._name === 'stylesheet')
        .reduce((indexed, record) => {
          indexed[record.url] = record;
          return indexed;
        }, {});

    return styles.reduce((indexed, stylesheet) => {
      indexed[stylesheet.header.styleSheetId] = Object.assign({
        usedRules: [],
        networkRecord: indexedNetworkRecords[stylesheet.header.sourceURL],
      }, stylesheet);
      return indexed;
    }, {});
  }

  /**
   * Adds used rules to their corresponding stylesheet.
   * @param {!Array.<{styleSheetId: string, used: boolean}>} rules The output of the CSSUsage gatherer.
   * @param {!Object} indexedStylesheets Stylesheet information indexed by id.
   */
  static indexUsedRules(rules, indexedStylesheets) {
    rules.forEach(rule => {
      const stylesheetInfo = indexedStylesheets[rule.styleSheetId];

      if (!stylesheetInfo || stylesheetInfo.isDuplicate) {
        return;
      }

      if (rule.used) {
        stylesheetInfo.usedRules.push(rule);
      }
    });
  }

  /**
   * @param {!Object} stylesheetInfo
   * @param {boolean} isInline
   * @return {{debugString: string|undefined, wastedBytes: number, totalBytes: number}}
   */
  static computeUsage(stylesheetInfo, isInline) {
    let usedUncompressedBytes = 0;
    const totalUncompressedBytes = stylesheetInfo.content.length;

    for (const usedRule of stylesheetInfo.usedRules) {
      usedUncompressedBytes += usedRule.endOffset - usedRule.startOffset;
    }

    // If we don't know for sure how many bytes this sheet used on the network,
    // we can guess it was roughly the size of the content gzipped.
    const totalBytes = stylesheetInfo.networkRecord ?
        stylesheetInfo.networkRecord.transferSize :
        Math.round(stylesheetInfo.content.length / 3);

    const percentUnused = (totalUncompressedBytes - usedUncompressedBytes) / totalUncompressedBytes;
    const wastedBytes = Math.round(percentUnused * totalBytes);

    let debugString;
    if (!isInline && !stylesheetInfo.networkRecord) {
      debugString = `Unable to find network record for ${stylesheetInfo.header.sourceURL}`;
    }

    return {
      debugString,
      wastedBytes,
      wastedPercent: percentUnused * 100,
      totalBytes,
    };
  }

  /**
   * Trims stylesheet content down to the first rule-set definition.
   * @param {string} content
   * @return {string}
   */
  static determineContentPreview(content) {
    let preview = content
        .slice(0, PREVIEW_LENGTH * 5)
        .replace(/( {2,}|\t)+/g, '  ') // remove leading indentation if present
        .replace(/\n\s+}/g, '\n}') // completely remove indentation of closing braces
        .trim(); // trim the leading whitespace

    if (preview.length > PREVIEW_LENGTH) {
      const firstRuleStart = preview.indexOf('{');
      const firstRuleEnd = preview.indexOf('}');

      if (firstRuleStart === -1 || firstRuleEnd === -1
          || firstRuleStart > firstRuleEnd
          || firstRuleStart > PREVIEW_LENGTH) {
        // We couldn't determine the first rule-set or it's not within the preview
        preview = preview.slice(0, PREVIEW_LENGTH) + '...';
      } else if (firstRuleEnd < PREVIEW_LENGTH) {
        // The entire first rule-set fits within the preview
        preview = preview.slice(0, firstRuleEnd + 1) + ' ...';
      } else {
        // The first rule-set doesn't fit within the preview, just show as many as we can
        const lastSemicolonIndex = preview.slice(0, PREVIEW_LENGTH).lastIndexOf(';');
        preview = lastSemicolonIndex < firstRuleStart ?
            preview.slice(0, PREVIEW_LENGTH) + '... } ...' :
            preview.slice(0, lastSemicolonIndex + 1) + ' ... } ...';
      }
    }

    return preview;
  }

  /**
   * @param {!Object} stylesheetInfo The stylesheetInfo object.
   * @param {string} pageUrl The URL of the page, used to identify inline styles.
   * @return {?{url: string, wastedBytes: number, totalBytes: number}}
   */
  static mapSheetToResult(stylesheetInfo, pageUrl) {
    if (stylesheetInfo.isDuplicate) {
      return null;
    }

    let url = stylesheetInfo.header.sourceURL;
    let isInline = false;
    if (!url || url === pageUrl) {
      const contentPreview = UnusedCSSRules.determineContentPreview(stylesheetInfo.content);
      url = {type: 'code', text: contentPreview};
      isInline = true;
    } else {
      url = URL.getURLDisplayName(url);
    }

    const usage = UnusedCSSRules.computeUsage(stylesheetInfo, isInline);
    return Object.assign({url}, usage);
  }

  /**
   * @param {!Artifacts} artifacts
   * @return {{results: !Array<Object>, headings: !Audit.Headings}}
   */
  static audit_(artifacts) {
    const styles = artifacts.Styles;
    const usage = artifacts.CSSUsage;
    const pageUrl = artifacts.URL.finalUrl;

    const devtoolsLogs = artifacts.devtoolsLogs[ByteEfficiencyAudit.DEFAULT_PASS];
    return artifacts.requestNetworkRecords(devtoolsLogs).then(networkRecords => {
      const indexedSheets = UnusedCSSRules.indexStylesheetsById(styles, networkRecords);
      UnusedCSSRules.indexUsedRules(usage, indexedSheets);

      const results = Object.keys(indexedSheets)
          .map(sheetId => UnusedCSSRules.mapSheetToResult(indexedSheets[sheetId], pageUrl))
          .filter(sheet => sheet && sheet.wastedBytes > 1024);

      const headings = [
        {key: 'url', itemType: 'url', text: 'URL'},
        {key: 'totalKb', itemType: 'text', text: 'Original'},
        {key: 'potentialSavings', itemType: 'text', text: 'Potential Savings'},
      ];

      const debugString = results
          .map(result => result.debugString)
          .filter(Boolean)
          .pop();

      return {
        debugString,
        results,
        headings,
      };
    });
  }
}

module.exports = UnusedCSSRules;
