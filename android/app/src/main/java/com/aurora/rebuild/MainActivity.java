package com.aurora.rebuild;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.app.AlertDialog;
public class MainActivity extends Activity {
  WebView web;
  @Override public void onCreate(Bundle b){super.onCreate(b);web=new WebView(this);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.setWebViewClient(new WebViewClient());setContentView(web);
    EditText input=new EditText(this);input.setSingleLine(true);input.setText("http://10.0.2.2:8000");
    new AlertDialog.Builder(this).setTitle("輸入你自己的後端網址").setMessage("模擬器可用 10.0.2.2；實體手機請使用電腦區網 IP。僅供本機開發，正式環境請用 HTTPS。") .setView(input).setCancelable(false).setPositiveButton("連線",(d,w)->{String url=input.getText().toString().trim();if(url.startsWith("http://")||url.startsWith("https://"))web.loadUrl(url);}).show();
  }
  @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}
