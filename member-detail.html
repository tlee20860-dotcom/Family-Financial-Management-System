<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>成員版面 | 家庭財務</title>
  <link rel="stylesheet" href="./css/theme.css">
  <link rel="stylesheet" href="./css/layout.css">
  <link rel="stylesheet" href="./css/components.css">
</head>
<body>
  <div class="app-shell">
    <aside id="sidebar-root"></aside>
    <div class="main-area">
      <header id="navbar-root"></header>

      <main class="content">
        <div class="page-header">
          <h1 class="page-title" id="member-name">載入中…</h1>
          <p class="page-subtitle" id="member-id-label"></p>
        </div>

        <!-- 全年模式 -->
        <div id="annual-view" style="display:none;">
          <div class="glass-card" style="margin-bottom:20px;">
            <div class="glass-card-title">全年總支出</div>
            <div class="glass-card-value red mono" id="annual-total">HK$ 0</div>
            <div class="glass-card-hint">依月份折疊顯示明細</div>
          </div>
          <div id="annual-monthly-cards"></div>
        </div>

        <!-- 單月模式 -->
        <div id="monthly-view" style="display:none;">
          <div class="glass-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; gap:12px; flex-wrap:wrap;">
              <div>
                <div class="glass-card-title" style="margin:0;">個人支出細項</div>
                <div class="glass-card-hint" id="expense-month-label"></div>
              </div>
              <div style="text-align:right;">
                <div class="glass-card-title" style="margin:0;">本月合計</div>
                <div class="mono text-cyan" id="expense-total" style="font-size:18px; font-weight:700;">HK$ 0</div>
              </div>
            </div>

            <div style="overflow-x:auto;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>項目名稱</th>
                    <th style="text-align:right;">金額</th>
                    <th>狀態</th>
                    <th>處理日期</th>
                  </tr>
                </thead>
                <tbody id="expense-tbody">
                  <tr><td colspan="4" class="empty-state">載入中…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>

  <script src="https://unpkg.com/lucide@latest"></script>
  <script type="module">
    import { initApp } from './js/app.js';
    import { initMemberDetailPage } from './js/member-detail.js';

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || '';

    await initApp({
      activeHref: `member-detail.html?id=${id}`,
      title: '成員版面'
    });

    if (!id) {
      document.getElementById('member-name').textContent = '未指定成員';
    } else {
      initMemberDetailPage(id);
    }
  </script>
</body>
</html>
