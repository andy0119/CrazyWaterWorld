// Report identifiers only; never include raw payloads, stack traces or credentials.
export function taskFailureDetail(error,task){
 const module=/^[A-Za-z0-9_\u3400-\u9fff／]+$/.test(task??'')?task:'未知模块';
 const message=String(error?.message??'');
 const timeout=/^timeout waiting for ([A-Za-z][A-Za-z0-9_]{0,100})$/.exec(message);
 const known=/^(?:unknown_|unconfirmed_|missing_|invalid_)[a-zA-Z0-9_]{1,100}$/.test(message)||['role_mismatch','connection_lost','login timeout'].includes(message);
 const reason=timeout?'等候 '+timeout[1]+' 回覆逾时':known?message:error instanceof TypeError?'程序类型错误':error instanceof RangeError?'程序范围错误':'未分类任务异常（未输出原始内容）';
 const request=/^[A-Za-z][A-Za-z0-9_]{0,100}Request$/.test(error?.request??'')?'；请求 '+error.request:'';
 return '模块 '+module+'；'+reason+request;
}
