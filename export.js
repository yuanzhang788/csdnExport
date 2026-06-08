const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

const CSDN_USERNAME = 'qq_31745863';
const OUTPUT_DIR = path.join(__dirname, 'articles');

// 生成 front-matter
function generateFrontMatter(title, date) {
    return `---
title: ${title}
date: ${date}
tags:
---
`;
}

// 获取所有文章ID
async function getArticleIds(page) {
    console.log('正在获取文章列表...');
    
    const articleIds = [];
    let pageNum = 1;
    let hasMore = true;

    while (hasMore) {
        const url = `https://blog.csdn.net/${CSDN_USERNAME}/article/list/${pageNum}`;
        console.log(`正在访问第 ${pageNum} 页: ${url}`);
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // 等待文章列表加载
        await page.waitForSelector('.article-list', { timeout: 10000 }).catch(() => {
            console.log('未找到文章列表,可能需要登录');
        });
        
        // 等待一下确保内容完全加载
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 提取文章ID
        const ids = await page.evaluate(() => {
            const links = document.querySelectorAll('div.article-item-box h4 a');
            const ids = [];
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                    const match = href.match(/article\/details\/(\d+)/);
                    if (match) {
                        ids.push(match[1]);
                    }
                }
            });
            return [...new Set(ids)]; // 去重
        });

        console.log(`第 ${pageNum} 页获取到 ${ids.length} 篇文章`);
        
        if (ids.length === 0) {
            hasMore = false;
            console.log('没有更多文章了');
        } else {
            // 添加新的文章ID(避免重复)
            ids.forEach(id => {
                if (!articleIds.includes(id)) {
                    articleIds.push(id);
                }
            });
            
            console.log(`当前总共获取到 ${articleIds.length} 篇文章`);
            
            // 检查是否有下一页按钮
            const hasNextPage = await page.evaluate(() => {
                // 尝试多种选择器
                const nextBtn = document.querySelector('.pagination-box .btn-pager.next') ||
                              document.querySelector('.pagination li.next') ||
                              document.querySelector('a[class*="next"]') ||
                              document.querySelector('[class*="pagination"] .next');
                
                if (nextBtn) {
                    // 检查是否被禁用
                    const isDisabled = nextBtn.classList.contains('disabled') || 
                                     nextBtn.getAttribute('disabled') !== null ||
                                     nextBtn.style.pointerEvents === 'none';
                    return !isDisabled;
                }
                return false;
            });
            
            if (!hasNextPage) {
                hasMore = false;
                console.log('已经是最后一页了');
            } else {
                pageNum++;
                // 延迟避免请求过快
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    console.log(`总共获取到 ${articleIds.length} 篇文章`);
    return articleIds;
}

// 扫码登录
async function scanLogin(page) {
    console.log('正在打开登录页面,请使用CSDN App扫码登录...');
    
    await page.goto('https://passport.csdn.net/login', { waitUntil: 'networkidle2' });
    
    // 等待页面加载,尝试找到二维码登录选项
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 尝试点击二维码登录按钮(可能有多种选择器)
    const qrSelectors = [
        '.main-select',
        '[class*="select"]',
        '.login-code-tab',
        'a[class*="code"]',
        '.code-login'
    ];
    
    for (const selector of qrSelectors) {
        try {
            const element = await page.$(selector);
            if (element) {
                await element.click();
                console.log(`已点击选择器: ${selector}`);
                break;
            }
        } catch (e) {
            continue;
        }
    }
    
    // 等待二维码出现
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 检查是否有二维码
    const hasQrCode = await page.$('.qr-img img') || await page.$('img[src*="qr"]') || await page.$('[class*="qr"] img');
    
    if (hasQrCode) {
        console.log('二维码已显示,请使用CSDN App扫描登录');
    } else {
        console.log('请手动切换到二维码登录方式');
    }
    
    // 等待登录成功(检测是否跳转到主页)
    await page.waitForFunction(() => {
        return !window.location.href.includes('passport.csdn.net');
    }, { timeout: 300000 }); // 5分钟超时
    
    console.log('登录成功!');
    await new Promise(resolve => setTimeout(resolve, 3000));
}

// 获取文章详情
async function getArticleDetail(page, articleId) {
    try {
        // 访问文章编辑页面
        const editorUrl = `https://mp.csdn.net/mp_blog/creation/editor/${articleId}`;
        console.log(`  访问编辑器: ${editorUrl}`);
        
        await page.goto(editorUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // 等待页面加载
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 尝试从页面中提取数据
        const articleData = await page.evaluate(() => {
            // 方式1: 查找 window 对象中的数据
            if (window.__INITIAL_STATE__ || window.__NUXT__ || window.__DATA__) {
                const state = window.__INITIAL_STATE__ || window.__NUXT__ || window.__DATA__;
                console.log('找到全局状态:', Object.keys(state));
            }
            
            // 方式2: 查找 script 标签中的 markdown 数据
            const scriptTags = document.querySelectorAll('script');
            for (const script of scriptTags) {
                const text = script.textContent;
                if (text && (text.includes('markdowncontent') || text.includes('markdownContent'))) {
                    // 尝试多种匹配模式
                    const patterns = [
                        /"markdowncontent"\s*:\s*"([^"]+)"/,
                        /"markdownContent"\s*:\s*"([^"]+)"/,
                        /markdowncontent["']\s*:\s*["']([^"']+)/,
                        /markdown_content["']\s*:\s*["']([^"']+)/
                    ];
                    
                    for (const pattern of patterns) {
                        const match = text.match(pattern);
                        if (match) {
                            let markdown = match[1];
                            // 处理转义字符
                            markdown = markdown.replace(/\\n/g, '\n')
                                              .replace(/\\t/g, '\t')
                                              .replace(/\\"/g, '"')
                                              .replace(/\\\\/g, '\\');
                            return {
                                found: true,
                                markdown: markdown
                            };
                        }
                    }
                }
            }
            
            // 方式3: 查找编辑器中的内容
            const editorEl = document.querySelector('.editor') || 
                           document.querySelector('#editor') || 
                           document.querySelector('[class*="editor"]') ||
                           document.querySelector('[class*="markdown"]');
            
            if (editorEl) {
                return {
                    found: true,
                    markdown: editorEl.innerText || editorEl.value || editorEl.textContent
                };
            }
            
            return { found: false };
        });
        
        if (articleData.found && articleData.markdown) {
            // 获取标题和时间
            const metaInfo = await page.evaluate(() => {
                const titleEl = document.querySelector('input[class*="title"]') || 
                              document.querySelector('[placeholder*="标题"]') ||
                              document.querySelector('.title-input');
                const title = titleEl ? (titleEl.value || titleEl.textContent) : '';
                
                return {
                    title: title || `article_${articleId}`
                };
            });
            
            return {
                title: metaInfo.title,
                markdown: articleData.markdown,
                pubDate: new Date().toISOString()
            };
        } else {
            console.error(`文章 ${articleId} 未能从页面提取到内容`);
            return null;
        }
        
    } catch (error) {
        console.error(`获取文章 ${articleId} 时出错:`, error.message);
        return null;
    } finally {
        // 尝试关闭可能的弹窗或对话框
        try {
            // 检查是否有确认对话框
            const dialog = await page.$('.el-message-box, .modal, .dialog, [class*="confirm"], [class*="dialog"]');
            if (dialog) {
                // 尝试点击确定/离开按钮
                const confirmBtn = await page.$('.el-button--primary, button[class*="confirm"], button[class*="primary"], [class*="btn"]');
                if (confirmBtn) {
                    await confirmBtn.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        } catch (e) {
            // 忽略错误
        }
    }
}

// 保存文章为md文件
async function saveArticle(article, index) {
    if (!article) return;
    
    // 格式化日期
    const date = new Date(article.pubDate);
    const formattedDate = date.toISOString().replace('T', ' ').substring(0, 19);
    
    // 生成文件名(去除非法字符)
    const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, '_').trim();
    const filename = `${safeTitle}.md`;
    const filepath = path.join(OUTPUT_DIR, filename);
    
    // 生成完整内容
    const content = generateFrontMatter(article.title, formattedDate) + article.markdown;
    
    // 保存文件
    await fs.writeFile(filepath, content, 'utf-8');
    console.log(`[${index + 1}] 已保存: ${filename}`);
}

// 主函数
async function main() {
    console.log('=== CSDN 文章导出工具 ===\n');
    
    // 创建输出目录
    await fs.ensureDir(OUTPUT_DIR);
    console.log(`输出目录: ${OUTPUT_DIR}\n`);
    
    let browser;
    try {
        // 启动浏览器
        browser = await puppeteer.launch({
            headless: false, // 显示浏览器窗口,方便扫码
            userDataDir: path.join(__dirname, 'browser_data'), // 保存登录状态
            defaultViewport: { width: 1280, height: 800 }
        });
        
        const page = await browser.newPage();
        
        // 设置用户代理
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // 自动处理浏览器对话框
        page.on('dialog', async dialog => {
            console.log('检测到对话框:', dialog.message());
            await dialog.accept(); // 自动点击确定
        });
        
        // 扫码登录
        await scanLogin(page);
        
        // 获取所有文章ID
        const articleIds = await getArticleIds(page);
        
        console.log('\n开始导出文章...\n');
        
        // 逐个获取文章详情并保存
        for (let i = 0; i < articleIds.length; i++) {
            const articleId = articleIds[i];
            console.log(`正在处理第 ${i + 1}/${articleIds.length} 篇文章 (ID: ${articleId})...`);
            
            const article = await getArticleDetail(page, articleId);
            await saveArticle(article, i);
            
            // 延迟避免请求过快
            if (i < articleIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // 尝试自动关闭弹窗或点击离开按钮
            try {
                // 检查是否有弹窗
                const hasDialog = await page.$('.el-message-box__wrapper, .modal-dialog, [class*="message-box"], [class*="confirm"]');
                if (hasDialog) {
                    console.log('  检测到弹窗,尝试自动关闭...');
                    // 尝试点击确定/确认/离开按钮
                    const buttons = [
                        '.el-button--primary',
                        'button.el-button--primary',
                        '[class*="btn-confirm"]',
                        '[class*="btn-primary"]',
                        'button[class*="primary"]'
                    ];
                    
                    for (const btnSelector of buttons) {
                        const btn = await page.$(btnSelector);
                        if (btn) {
                            await btn.click();
                            console.log(`  已点击按钮: ${btnSelector}`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            break;
                        }
                    }
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        console.log('\n=== 导出完成! ===');
        console.log(`共导出 ${articleIds.length} 篇文章到 ${OUTPUT_DIR} 目录`);
        
    } catch (error) {
        console.error('发生错误:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// 运行主函数
main().catch(console.error);
