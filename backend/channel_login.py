"""Channel availability and explicitly unverified account setup."""
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
import time
import json
from pathlib import Path

CHANNELS = {
    'douyin_cn': {'label': '抖音小程序', 'method': 'qr', 'method_label': '抖音官方標準版掃碼', 'login_available': False, 'execution_available': False, 'message': '小程序掃碼授權尚未接通。官方方案需要遊戲方提供授權交換接口，或授權服務商串接；一般抖音帳號掃碼不能替代。尚未提供一般使用者自助登入。'},
    'yishijie': {'label': 'APP（益世界）', 'method': 'password', 'method_label': '益世界 APP 帳號登入', 'login_available': False, 'execution_available': False, 'message': 'APP 後端獨立登入已在測試中驗證；一般使用者的網頁帳密登入與會話更新尚未接通，目前可先保存自己的帳號設定。'},
}

class ChannelDraft(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    nickname: str = Field(default='', max_length=100)
    server_name: str = Field(default='', max_length=100)
    @field_validator('username')
    @classmethod
    def trim_username(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('請填寫帳號識別名稱')
        return value
    class Config:
        extra = 'forbid'

def mount_channel_routes(app, auth, conn):
    router = APIRouter(prefix='/api/game-login')
    @router.get('/channels')
    def channels(authorization: str | None = Header(None)):
        auth(authorization)
        return {'channels': [{'id': key, **value} for key, value in CHANNELS.items()]}

    @router.get('/channels/{channel}')
    def channel_status(channel: str, authorization: str | None = Header(None)):
        auth(authorization)
        if channel not in CHANNELS:
            raise HTTPException(404, '未知登入渠道')
        return {'id': channel, **CHANNELS[channel]}

    @router.post('/channels/{channel}/draft')
    def create_draft(channel: str, data: ChannelDraft, authorization: str | None = Header(None)):
        user = auth(authorization)
        if channel not in CHANNELS:
            raise HTTPException(404, '未知登入渠道')
        with conn() as db:
            result = db.execute('INSERT INTO subusers(parent_id,username,server_name,platform,nickname,status,created) VALUES(?,?,?,?,?,?,?)', (user['id'], data.username, data.server_name.strip(), channel, data.nickname.strip(), 'idle', int(time.time())))
            account_id = result.lastrowid
        return {'success': True, 'id': account_id, 'platform': channel, 'verified': False, 'execution_available': False, 'settings_url': '/settings.html?account=' + str(account_id), 'message': '已建立帳號資料，可設定任務；尚未驗證遊戲登入。'}
    app.include_router(router)
