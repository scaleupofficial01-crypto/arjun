//+------------------------------------------------------------------+
//| Empire MT5 Bridge (read-only) — empire_bridge.mq5                |
//|                                                                  |
//| WHAT THIS DOES: every N seconds it reads YOUR account snapshot   |
//| (balance/equity), open positions and recent closed deals, and    |
//| POSTs them as JSON to your Empire app over HTTPS using a         |
//| per-account Bearer token.                                        |
//|                                                                  |
//| SECURITY (by design):                                            |
//|  • Your MT5 login/password is NEVER sent anywhere — it stays     |
//|    inside the terminal. Only the scoped ingest token is sent.    |
//|  • Read-only: this EA places NO trades and cannot.               |
//|  • Rotating the token in the app instantly revokes this bridge.  |
//|                                                                  |
//| SETUP (2 minutes):                                               |
//|  1. Empire app → MT5 Sync → Add account → copy the token shown   |
//|     once, and the Ingest URL shown next to it.                   |
//|  2. MetaTrader 5 → Tools → Options → Expert Advisors → tick      |
//|     "Allow WebRequest for listed URL" and add your app origin    |
//|     (e.g. https://empire-hub.vercel.app).                        |
//|  3. Drag this EA onto any chart, fill IngestUrl + IngestToken,   |
//|     keep Algo Trading enabled. First sync within a minute.       |
//+------------------------------------------------------------------+
#property copyright "Empire — The Real Trader's Hub"
#property version   "1.00"
#property strict

input string IngestUrl     = "https://empire-hub.vercel.app/api/mt5/ingest"; // Empire ingest URL
input string IngestToken   = "";        // mt5_... token from the app (shown once)
input int    TimerSeconds  = 60;        // sync interval
input int    HistoryDays   = 30;        // closed-deals lookback on first run

//--- tiny JSON helpers (MQL5 has no built-in JSON) ---------------------------
string JsonEsc(const string s)
{
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   StringReplace(r, "\n", "\\n");
   return r;
}

string IsoTime(const datetime t)
{
   // server also accepts raw unix seconds — simpler + timezone-safe
   return IntegerToString((long)t);
}

//--- payload builders ---------------------------------------------------------
string BuildAccountJson()
{
   return StringFormat(
      "\"account\":{\"login\":\"%I64u\",\"server\":\"%s\",\"balance\":%s,\"equity\":%s,\"currency\":\"%s\"}",
      AccountInfoInteger(ACCOUNT_LOGIN),
      JsonEsc(AccountInfoString(ACCOUNT_SERVER)),
      DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2),
      DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2),
      JsonEsc(AccountInfoString(ACCOUNT_CURRENCY))
   );
}

string BuildPositionsJson()
{
   string out = "\"positions\":[";
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      string side = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      out += StringFormat(
         "%s{\"ticket\":\"%I64u\",\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%s,\"openPrice\":%s,\"openAt\":%s,\"profit\":%s}",
         (i == 0 ? "" : ","),
         ticket,
         JsonEsc(PositionGetString(POSITION_SYMBOL)),
         side,
         DoubleToString(PositionGetDouble(POSITION_VOLUME), 8),
         DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 8),
         IsoTime((datetime)PositionGetInteger(POSITION_TIME)),
         DoubleToString(PositionGetDouble(POSITION_PROFIT), 2)
      );
   }
   out += "]";
   return out;
}

string BuildDealsJson(const datetime from)
{
   if(!HistorySelect(from, TimeCurrent() + 60)) return "\"deals\":[]";
   string out = "\"deals\":[";
   int count = HistoryDealsTotal();
   int emitted = 0;
   for(int i = 0; i < count; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_IN && entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
      long dtype = HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue; // skip balance ops
      string entryStr = (entry == DEAL_ENTRY_IN) ? "IN" : (entry == DEAL_ENTRY_OUT ? "OUT" : "INOUT");
      out += StringFormat(
         "%s{\"ticket\":\"%I64u\",\"positionId\":\"%I64u\",\"symbol\":\"%s\",\"side\":\"%s\",\"entry\":\"%s\",\"volume\":%s,\"price\":%s,\"profit\":%s,\"commission\":%s,\"swap\":%s,\"dealtAt\":%s}",
         (emitted == 0 ? "" : ","),
         ticket,
         HistoryDealGetInteger(ticket, DEAL_POSITION_ID),
         JsonEsc(HistoryDealGetString(ticket, DEAL_SYMBOL)),
         (dtype == DEAL_TYPE_BUY ? "BUY" : "SELL"),
         entryStr,
         DoubleToString(HistoryDealGetDouble(ticket, DEAL_VOLUME), 8),
         DoubleToString(HistoryDealGetDouble(ticket, DEAL_PRICE), 8),
         DoubleToString(HistoryDealGetDouble(ticket, DEAL_PROFIT), 2),
         DoubleToString(HistoryDealGetDouble(ticket, DEAL_COMMISSION), 2),
         DoubleToString(HistoryDealGetDouble(ticket, DEAL_SWAP), 2),
         IsoTime((datetime)HistoryDealGetInteger(ticket, DEAL_TIME))
      );
      emitted++;
   }
   out += "]";
   return out;
}

//--- EA lifecycle -------------------------------------------------------------
datetime g_firstFrom = 0;

int OnInit()
{
   if(IngestToken == "" || StringFind(IngestToken, "mt5_") != 0)
   {
      Alert("Empire Bridge: paste the mt5_... ingest token from the app into EA inputs.");
      return INIT_FAILED;
   }
   g_firstFrom = TimeCurrent() - HistoryDays * 86400;
   EventSetTimer(MathMax(TimerSeconds, 10));
   OnTimer();
   Print("Empire Bridge: started — syncing every ", TimerSeconds, "s to ", IngestUrl);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer()
{
   string body = "{" + BuildAccountJson() + "," + BuildPositionsJson() + "," + BuildDealsJson(g_firstFrom) + "}";
   char post[];
   char result[];
   string resultHeaders;
   int len = StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8) - 1; // strip null
   ArrayResize(post, len);

   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + IngestToken + "\r\n";
   ResetLastError();
   int code = WebRequest("POST", IngestUrl, headers, 8000, post, result, resultHeaders);
   if(code == -1)
   {
      Print("Empire Bridge: WebRequest error ", GetLastError(),
            " — is the origin whitelisted in Tools → Options → Expert Advisors?");
      return;
   }
   Print("Empire Bridge: sync ", code, " @", TimeToString(TimeCurrent(), TIME_SECONDS));
}
//+------------------------------------------------------------------+
