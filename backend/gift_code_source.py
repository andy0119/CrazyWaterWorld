"""Read the fixed public gift-code article; no game credentials are sent."""
import re,time,threading,urllib.request
from html.parser import HTMLParser
from datetime import datetime,timezone,timedelta
SOURCE='https://m.ali213.net/news/gl2512/1723109.html'
class ArticleText(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.hidden=0
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style'):self.hidden+=1
  if tag=='br':self.parts.append('\n')
 def handle_endtag(self,tag):
  if tag in ('script','style'):self.hidden=max(0,self.hidden-1)
  if tag in ('p','div','h1','h2','h3','li'):self.parts.append('\n')
 def handle_data(self,text):
  if not self.hidden:self.parts.append(text)
def parse_article(html):
 parser=ArticleText();parser.feed(html);text=''.join(parser.parts)
 start=text.find('最新兑换码');end=text.find('二、使用方式',start)
 if start<0 or end<start:raise ValueError('article_structure_changed')
 codes=[]
 for line in text[start:end].splitlines():
  value=re.split(r'[（(]',line.strip(),maxsplit=1)[0].strip()
  if re.fullmatch(r'[A-Za-z0-9\u4e00-\u9fff]{4,32}',value) and value not in codes:codes.append(value)
 if not codes or len(codes)>300:raise ValueError('article_codes_invalid')
 stamp=re.search(r'更新时间[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)',text)
 return {'codes':codes,'source':SOURCE,'source_updated_at':stamp.group(1) if stamp else None}
_lock=threading.Lock();_cached=None;_at=0
def latest_codes(fallback):
 global _cached,_at
 with _lock:
  if _cached and time.monotonic()-_at<300:return dict(_cached)
  try:
   request=urllib.request.Request(SOURCE,headers={'User-Agent':'Mozilla/5.0'})
   with urllib.request.urlopen(request,timeout=12) as response:
    if response.geturl().split('/')[2]!='m.ali213.net':raise ValueError('unexpected_redirect')
    body=response.read(1500001)
   if len(body)>1500000:raise ValueError('article_too_large')
   data=parse_article(body.decode('utf-8'));data['checked_at']=datetime.now(timezone(timedelta(hours=8))).isoformat(timespec='seconds');data['stale']=False
  except Exception:
   data=dict(_cached or fallback);data['stale']=True;data['notice']='公开来源读取失败，使用上次候选清单；不代表最新或有效。'
  _cached=data;_at=time.monotonic();return dict(data)
