<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" 
  xmlns:html="http://www.w3.org/TR/REC-html40"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <title>XML Sitemap — Syntrabase</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <style type="text/css">
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #0b0f19;
            color: #f1f5f9;
            padding: 40px 20px;
            margin: 0;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
            background: #111827;
            padding: 32px;
            border-radius: 12px;
            border: 1px solid #1e293b;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
          }
          h1 {
            color: #38bdf8;
            font-size: 24px;
            margin-top: 0;
            margin-bottom: 8px;
          }
          p {
            color: #94a3b8;
            font-size: 14px;
            line-height: 1.6;
            margin-top: 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 24px;
          }
          th {
            background: #1e293b;
            color: #e2e8f0;
            text-align: left;
            padding: 12px 16px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          td {
            padding: 14px 16px;
            border-bottom: 1px solid #1e293b;
            font-size: 14px;
          }
          tr:hover td {
            background: rgba(56, 189, 248, 0.04);
          }
          a {
            color: #38bdf8;
            text-decoration: none;
            word-break: break-all;
          }
          a:hover {
            text-decoration: underline;
          }
          .badge {
            display: inline-block;
            background: #0284c7;
            color: #fff;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Syntrabase XML Sitemap</h1>
          <p>Authoritative XML Sitemap generated for Google Search Console and web indexation.</p>
          <table>
            <thead>
              <tr>
                <th>Location (URL)</th>
                <th>Last Modified</th>
                <th>Frequency</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <tr>
                  <td>
                    <a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a>
                  </td>
                  <td style="color: #94a3b8;"><xsl:value-of select="sitemap:lastmod"/></td>
                  <td><span class="badge"><xsl:value-of select="sitemap:changefreq"/></span></td>
                  <td style="color: #38bdf8; font-weight: bold;"><xsl:value-of select="sitemap:priority"/></td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
