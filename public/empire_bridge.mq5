//+------------------------------------------------------------------+
//| Empire MT5 Bridge v2 — empire_bridge.mq5                         |
//|                                                                  |
//| WHAT THIS DOES:                                                  |
//|  1. Every N seconds reads your account snapshot (balance/equity),|
//|     open positions, recent closed deals, and LIVE bid/ask quotes |
//|     for your Market Watch symbols, and POSTs them to your Empire |
//|     app over HTTPS with your per-account Bearer token.           |
//|  2. Right after each push it polls the app for trade commands    |
//|     that YOU clicked in the app (SELL/BUY a market position).    |
//|     It executes those as MARKET orders from THIS terminal and    |
//|     reports the broker's own verdict (fill ticket or the exact   |
//|     retcode) back to the app.                                    |
//|                                                                  |
//| SECURITY (by design):                                            |
//|  • Your MT5 login/password NEVER leaves this terminal. The app   |
//|    cannot trade by itself — only this EA, running here, can, and |
//|    only when its scoped ingest token is valid.                   |
//|  • Rotating the token in the app instantly revokes everything    |
//|    (both sync AND trading).                                      |
//|  • Market orders only. The app cannot place pending orders,      |
//|    modify SL/TP, or touch positions you opened elsewhere.        |
//|                                                                  |
//| SETUP (2 minutes):                                               |
//|  1. Empire app → MT5 Sync → Add account → copy the token shown   |
//|     once, and the Ingest URL shown next to it.                   |
//|  2. MetaTrader 5 → Tools → Options → Expert Advisors → tick      |
//|     "Allow WebRequest for listed URL" and add your app origin    |
//|     (e.g. https://empire-trading-app.vercel.app).                        |
//|  3. Drag this EA onto any chart, fill IngestUrl + IngestToken,   |
//|     keep Algo Trading ON (v2 needs it to execute your clicks).   |
//|     First sync within a minute.                                  |
//+------------------------------------------------------------------+
#property copyright "Empire — The Real Trader's Hub"
#property version   "2.00"
#property strict

#define EA_VERSION   "2.00"
#define EMPIRE_MAGIC 20261014

input string IngestUrl     = "https://empire-trading-app.vercel.app/api/mt5/ingest"; // Empire ingest URL
input string IngestToken   = "";        // mt5_... token from the app (shown once)
input int    TimerSeconds  = 10;        // sync + command-poll interval (min 2)
input int    HistoryDays   = 30;        // closed-deals lookback
input int    MaxQuotes     = 30;        // how many Market Watch symbols to quote
input int    SlippagePoints= 20;        // max deviation for market orders

string g_pollUrl   = "";
string g_reportUrl = "";

//+------------------------------------------------------------------+
//| derive poll/report URLs from the ingest URL                      |
//+------------------------------------------------------------------+
string BaseOrigin(string url)
{
   int p = StringFind(url, "/api/");
   if(p < 0) return url;
   return StringSubstr(url, 0, p);
}

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

//--- minimal JSON readers for the command list -----------------------
string JsonStr(const string obj, const string key)
{
   string k = "\"" + key + "\"";
   int p = StringFind(obj, k);
   if(p < 0) return "";
   int colon = StringFind(obj, ":", p + StringLen(k));
   if(colon < 0) return "";
   int q1 = StringFind(obj, "\"", colon + 1);
   if(q1 < 0) return ""; // not a string value
   int q2 = StringFind(obj, "\"", q1 + 1);
   if(q2 < 0) return "";
   return StringSubstr(obj, q1 + 1, q2 - q1 - 1);
}

double JsonNum(const string obj, const string key, bool &ok)
{
   ok = false;
   string k = "\"" + key + "\"";
   int p = StringFind(obj, k);
   if(p < 0) return 0;
   int colon = StringFind(obj, ":", p + StringLen(k));
   if(colon < 0) return 0;
   int start = colon + 1;
   int n = StringLen(obj);
   while(start < n && (StringGetCharacter(obj, start) == ' ')) start++;
   // number may be bare or quoted
   bool quoted = (start < n && StringGetCharacter(obj, start) == '"');
   if(quoted) start++;
   int end = start;
   while(end < n)
   {
      ushort c = StringGetCharacter(obj, end);
      if(c == '"' || c == ',' || c == '}' || c == ']') break;
      end++;
   }
   string v = StringSubstr(obj, start, end - start);
   ok = (StringLen(v) > 0);
   return StringToDouble(v);
}

//--- payload builders --------------------------------------------------------
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
   int emitted = 0;
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      string side = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      out += StringFormat(
         "%s{\"ticket\":\"%I64u\",\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%s,\"openPrice\":%s,\"openAt\":%s,\"profit\":%s}",
         (emitted == 0 ? "" : ","),
         ticket,
         JsonEsc(PositionGetString(POSITION_SYMBOL)),
         side,
         DoubleToString(PositionGetDouble(POSITION_VOLUME), 8),
         DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 8),
         IsoTime((datetime)PositionGetInteger(POSITION_TIME)),
         DoubleToString(PositionGetDouble(POSITION_PROFIT), 2)
      );
      emitted++;
   }
   out += "]";
   return out;
}

// LIVE bid/ask for Market Watch symbols — the app shows exactly what YOUR
// broker quotes this terminal, including your spread.
string BuildQuotesJson()
{
   string out = "\"quotes\":[";
   int emitted = 0;
   int total = SymbolsTotal(true); // Market Watch only
   for(int i = 0; i < total && emitted < MaxQuotes; i++)
   {
      string sym = SymbolName(i, true);
      if(sym == "") continue;
      MqlTick tick;
      if(!SymbolInfoTick(sym, tick)) continue;
      if(tick.bid <= 0 || tick.ask <= 0) continue;
      out += StringFormat(
         "%s{\"symbol\":\"%s\",\"bid\":%s,\"ask\":%s,\"tickAt\":%s}",
         (emitted == 0 ? "" : ","),
         JsonEsc(sym),
         DoubleToString(tick.bid, 8),
         DoubleToString(tick.ask, 8),
         IsoTime((datetime)tick.time)
      );
      emitted++;
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

//--- trade execution ---------------------------------------------------------
string RetcodeText(const uint code)
{
   switch(code)
   {
      case TRADE_RETCODE_DONE:           return "done";
      case TRADE_RETCODE_PLACED:         return "placed";
      case TRADE_RETCODE_REJECT:         return "request rejected by server";
      case TRADE_RETCODE_CANCEL:         return "canceled";
      case TRADE_RETCODE_ERROR:          return "request error";
      case TRADE_RETCODE_TIMEOUT:        return "request timeout";
      case TRADE_RETCODE_INVALID:        return "invalid request";
      case TRADE_RETCODE_INVALID_VOLUME: return "invalid volume for this symbol";
      case TRADE_RETCODE_INVALID_PRICE:  return "invalid price";
      case TRADE_RETCODE_INVALID_STOPS:  return "invalid stops";
      case TRADE_RETCODE_TRADE_DISABLED: return "trading disabled on account";
      case TRADE_RETCODE_MARKET_CLOSED:  return "market closed";
      case TRADE_RETCODE_NO_MONEY:       return "not enough money (margin)";
      case TRADE_RETCODE_PRICE_OFF:      return "no quotes / market off";
      case TRADE_RETCODE_CONNECTION:     return "no connection to trade server";
      case TRADE_RETCODE_TOO_MANY_REQUESTS: return "too many requests";
      case TRADE_RETCODE_LIMIT_VOLUME:   return "broker position/volume limit reached";
   }
   return "retcode " + IntegerToString(code);
}

// normalize volume to the symbol's own step/min/max (broker rules)
double NormalizeVolume(const string sym, const double v, bool &ok)
{
   ok = false;
   double vmin  = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double vmax  = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   double vstep = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   if(vmin <= 0 || vstep <= 0) return 0;
   double vol = MathFloor(v / vstep + 0.5) * vstep;
   vol = MathMax(vmin, MathMin(vmax > 0 ? vmax : vol, vol));
   ok = (vol >= vmin);
   return NormalizeDouble(vol, 8);
}

void ReportResult(const string id, const bool done, const string ticketOrEmpty, const string errOrEmpty)
{
   string body;
   if(done)
      body = "{\"id\":\"" + JsonEsc(id) + "\",\"result\":\"DONE\",\"ticket\":\"" + JsonEsc(ticketOrEmpty) + "\"}";
   else
      body = "{\"id\":\"" + JsonEsc(id) + "\",\"result\":\"FAILED\",\"error\":\"" + JsonEsc(errOrEmpty) + "\"}";

   char post[], result[];
   string resultHeaders;
   int len = StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   ArrayResize(post, len);
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + IngestToken + "\r\n";
   WebRequest("POST", g_reportUrl, headers, 8000, post, result, resultHeaders);
}

void ExecuteOne(const string cmdObj)
{
   string id     = JsonStr(cmdObj, "id");
   string symbol = JsonStr(cmdObj, "symbol");
   string side   = JsonStr(cmdObj, "side");
   bool   ok     = false;
   double volume = JsonNum(cmdObj, "volume", ok);
   if(id == "" || symbol == "" || !ok || volume <= 0)
   {
      if(id != "") ReportResult(id, false, "", "unparseable command payload");
      return;
   }

   // pre-flight: terminal + account actually allowed to trade right now
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
   { ReportResult(id, false, "", "Algo Trading is OFF in the terminal"); return; }
   if(!AccountInfoInteger(ACCOUNT_TRADE_EXPERT))
   { ReportResult(id, false, "", "account disallows expert trading (login/master switch)"); return; }
   if(!SymbolSelect(symbol, true))
   { ReportResult(id, false, "", "symbol not available on this broker: " + symbol); return; }
   if(SymbolInfoInteger(symbol, SYMBOL_TRADE_MODE) == SYMBOL_TRADE_MODE_DISABLED)
   { ReportResult(id, false, "", "symbol trading disabled by broker: " + symbol); return; }

   bool volOk = false;
   double vol = NormalizeVolume(symbol, volume, volOk);
   if(!volOk)
   { ReportResult(id, false, "", "volume below broker minimum for " + symbol); return; }

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick) || tick.bid <= 0 || tick.ask <= 0)
   { ReportResult(id, false, "", "no live quotes for " + symbol + " (market closed?)"); return; }

   MqlTradeRequest req; ZeroMemory(req);
   MqlTradeResult  res; ZeroMemory(res);
   req.action    = TRADE_ACTION_DEAL;
   req.symbol    = symbol;
   req.volume    = vol;
   req.magic     = EMPIRE_MAGIC;
   req.deviation = SlippagePoints;
   req.comment   = "empire";
   bool isBuy    = (side == "BUY");
   req.type      = isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   req.price     = isBuy ? tick.ask : tick.bid;
   // filling mode: prefer IOC when the broker allows it, else FOK
   long fm = SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
   req.type_filling = ((fm & 2) == 2) ? ORDER_FILLING_IOC : ORDER_FILLING_FOK;

   ResetLastError();
   if(!OrderSend(req, res))
   {
      ReportResult(id, false, "", "OrderSend error " + IntegerToString(GetLastError()));
      return;
   }
   if(res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_PLACED)
   {
      ulong t = (res.deal > 0 ? res.deal : res.order);
      Print("Empire Bridge: executed ", side, " ", vol, " ", symbol, " -> deal #", t,
            " @", res.price);
      ReportResult(id, true, IntegerToString(t), "");
      return;
   }
   string why = RetcodeText(res.retcode);
   if(StringLen(res.comment) > 0) why += " (" + res.comment + ")";
   Print("Empire Bridge: rejected ", side, " ", vol, " ", symbol, " -> ", why);
   ReportResult(id, false, "", why);
}

void PollAndTrade()
{
   if(g_pollUrl == "") return;
   char dummy[]; ArrayResize(dummy, 0);
   char result[];
   string resultHeaders;
   string headers = "Authorization: Bearer " + IngestToken + "\r\n";
   ResetLastError();
   int code = WebRequest("GET", g_pollUrl, headers, 8000, dummy, result, resultHeaders);
   if(code == -1 || code != 200) return;

   string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   int p = StringFind(body, "\"commands\"");
   if(p < 0) return;
   int arrStart = StringFind(body, "[", p);
   if(arrStart < 0) return;

   // walk object-by-object inside the array (brace matching)
   int depth = 0, objStart = -1;
   int executed = 0;
   for(int i = arrStart; i < StringLen(body); i++)
   {
      ushort c = StringGetCharacter(body, i);
      if(c == '{') { if(depth == 0) objStart = i; depth++; }
      else if(c == '}')
      {
         depth--;
         if(depth == 0 && objStart >= 0)
         {
            ExecuteOne(StringSubstr(body, objStart, i - objStart + 1));
            objStart = -1;
            executed++;
         }
      }
      else if(c == ']' && depth == 0) break;
   }
   if(executed > 0) Print("Empire Bridge: processed ", executed, " app command(s)");
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
   string base = BaseOrigin(IngestUrl);
   g_pollUrl   = base + "/api/mt5/commands/poll";
   g_reportUrl = base + "/api/mt5/commands/report";
   g_firstFrom = TimeCurrent() - HistoryDays * 86400;
   EventSetTimer(MathMax(TimerSeconds, 2));
   OnTimer();
   Print("Empire Bridge v", EA_VERSION, ": started — sync + trade-poll every ",
         MathMax(TimerSeconds, 2), "s to ", IngestUrl);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer()
{
   string body = "{" + BuildAccountJson() + "," + BuildPositionsJson() + "," +
                 BuildQuotesJson() + ",\"eaVersion\":\"" + EA_VERSION + "\"," +
                 BuildDealsJson(g_firstFrom) + "}";
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

   PollAndTrade();
}
//+------------------------------------------------------------------+
