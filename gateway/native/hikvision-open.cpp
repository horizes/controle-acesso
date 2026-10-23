// Build against the official HCNetSDK supplied under Hikvision's licence.
// Credentials arrive on stdin, never in command-line arguments or logs.
#include <iostream>
#include <string>
#include <cstring>
#include "HCNetSDK.h"
int main(){
  std::string host,port,user,password,door;
  if(!std::getline(std::cin,host)||!std::getline(std::cin,port)||!std::getline(std::cin,user)||!std::getline(std::cin,password)||!std::getline(std::cin,door))return 2;
  NET_DVR_USER_LOGIN_INFO login{};NET_DVR_DEVICEINFO_V40 info{};
  if(host.size()>=sizeof(login.sDeviceAddress)||user.size()>=sizeof(login.sUserName)||password.size()>=sizeof(login.sPassword))return 2;
  try{const auto value=std::stoul(port);if(value<1||value>65535)return 2;login.wPort=static_cast<WORD>(value);}catch(...){return 2;}
  std::memcpy(login.sDeviceAddress,host.c_str(),host.size());std::memcpy(login.sUserName,user.c_str(),user.size());std::memcpy(login.sPassword,password.c_str(),password.size());login.bUseAsynLogin=FALSE;
  long channel=0;try{channel=std::stol(door);}catch(...){return 2;}if(channel<1||channel>64)return 2;
  if(!NET_DVR_Init()){std::cout<<"{\"accepted\":false,\"errorCode\":0}";return 1;}
  NET_DVR_SetConnectTime(2000,1);const LONG handle=NET_DVR_Login_V40(&login,&info);
  std::fill(password.begin(),password.end(),'\0');std::memset(login.sPassword,0,sizeof(login.sPassword));
  if(handle<0){const DWORD code=NET_DVR_GetLastError();NET_DVR_Cleanup();std::cout<<"{\"accepted\":false,\"errorCode\":"<<code<<"}";return 1;}
  const BOOL accepted=NET_DVR_ControlGateway(handle,channel,1);const DWORD code=accepted?0:NET_DVR_GetLastError();NET_DVR_Logout(handle);NET_DVR_Cleanup();
  std::cout<<"{\"accepted\":"<<(accepted?"true":"false")<<",\"errorCode\":"<<code<<"}";return accepted?0:1;
}
