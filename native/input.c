#define _POSIX_C_SOURCE 200809L
#include <linux/input.h>
#include <linux/uinput.h>
#include <sys/ioctl.h>
#include <poll.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <errno.h>
#include <time.h>
static int physical=-1, virtual=-1;
static volatile sig_atomic_t stopping=0;
static void stop(int sig) {(void)sig;stopping=1;}
static int emit(int type,int code,int value) {
 struct input_event ev={0}; ev.type=type;ev.code=code;ev.value=value;
 return write(virtual,&ev,sizeof ev)==sizeof ev?0:-1;
}
static int key(int code,int value) {return emit(EV_KEY,code,value)||emit(EV_SYN,SYN_REPORT,0);}
static void cleanup(void) {
 if(physical>=0) ioctl(physical,EVIOCGRAB,0);
 if(virtual>=0) {for(int c=1;c<KEY_CNT;c++) key(c,0);ioctl(virtual,UI_DEV_DESTROY);close(virtual);}
 if(physical>=0) close(physical);
}
static int reply(char *buf,size_t size) {
 size_t n=0;
 // Bound total request time, not only the time between bytes.
 struct timespec begin;clock_gettime(CLOCK_MONOTONIC,&begin);
 while(n+1<size && !stopping) {
  struct timespec now;clock_gettime(CLOCK_MONOTONIC,&now);
  long elapsed=(now.tv_sec-begin.tv_sec)*1000+(now.tv_nsec-begin.tv_nsec)/1000000;
  if(elapsed>=2000) return -1;
  struct pollfd p={STDIN_FILENO,POLLIN,0}; int r=poll(&p,1,2000-(int)elapsed);
  if(r<0 && errno==EINTR) continue;
  if(r<=0) return -1;
  char ch; if(read(0,&ch,1)!=1) return -1;
  if(ch=='\n') {buf[n]=0;return 0;}buf[n++]=ch;
 }
 return -1;
}
int main(int argc,char **argv) {
 if(argc!=2) return 2;
 struct sigaction action={0};action.sa_handler=stop;sigemptyset(&action.sa_mask);
 sigaction(SIGTERM,&action,NULL);sigaction(SIGINT,&action,NULL);sigaction(SIGPIPE,&action,NULL);atexit(cleanup);
 physical=open(argv[1],O_RDONLY|O_CLOEXEC);virtual=open("/dev/uinput",O_WRONLY|O_CLOEXEC);
 if(physical<0 || virtual<0) {perror("snipd: device access");return 1;}
 char name[256]={0};if(ioctl(physical,EVIOCGNAME(sizeof name),name)<0 || strncmp(name,"snipd",5)==0) return 1;
 if(ioctl(virtual,UI_SET_EVBIT,EV_KEY)<0 || ioctl(virtual,UI_SET_EVBIT,EV_SYN)<0) return 1;
 for(int c=1;c<KEY_CNT;c++) if(ioctl(virtual,UI_SET_KEYBIT,c)<0) return 1;
 struct uinput_setup setup={0};strcpy(setup.name,"snipd virtual keyboard");setup.id.bustype=BUS_VIRTUAL;
 if(ioctl(virtual,UI_DEV_SETUP,&setup)<0 || ioctl(virtual,UI_DEV_CREATE)<0) return 1;
 // Give the compositor time to discover the new device before grabbing.
 struct timespec delay={1,0};nanosleep(&delay,NULL);
 unsigned long held[(KEY_CNT+8*sizeof(unsigned long)-1)/(8*sizeof(unsigned long))]={0};
 if(ioctl(physical,EVIOCGKEY(sizeof held),held)<0) return 1;
 for(int c=1;c<KEY_CNT;c++) if(held[c/(8*sizeof(unsigned long))] & (1UL<<(c%(8*sizeof(unsigned long))))) {fputs("snipd: release all keyboard keys before starting\n",stderr);return 1;}
 unsigned long leds=0;
 if(ioctl(physical,EVIOCGLED(sizeof leds),&leds)<0 || (leds & (1UL<<LED_CAPSL))) {fputs("snipd: turn off Caps Lock before starting\n",stderr);return 1;}
 if(stopping || ioctl(physical,EVIOCGRAB,1)<0) return 1;
 setvbuf(stdout,NULL,_IONBF,0);
 while(!stopping) {
  struct input_event ev;ssize_t n=read(physical,&ev,sizeof ev);
  if(n<0 && errno==EINTR) continue;
  if(n!=sizeof ev) break;
  if(ev.type==EV_SYN && ev.code==SYN_DROPPED) {fputs("snipd: input overflow\n",stderr);break;}
  if(ev.type==EV_SYN) {if(emit(EV_SYN,ev.code,ev.value)<0) break;continue;}
  if(ev.type!=EV_KEY) continue;
  printf("%u %d\n",ev.code,ev.value);
  char line[65536]; if(reply(line,sizeof line)<0) {key(ev.code,ev.value);break;}
  if(key(ev.code,ev.value)<0) break;
  if(strcmp(line,"F")==0) continue;
  // R <erase> <count> followed by bounded key/value pairs. No arbitrary commands.
  int erase,count,used=0;
  if(sscanf(line,"R %d %d %n",&erase,&count,&used)!=2 || erase<0 || erase>65 || count<0 || count>4096) break;
  char *cursor=line+used;int codes[4096],values[4096],ok=1;
  for(int i=0;i<count;i++) {used=0;
   if(sscanf(cursor,"%d %d %n",&codes[i],&values[i],&used)!=2 || codes[i]<1 || codes[i]>=KEY_CNT || (values[i]!=0 && values[i]!=1)) {ok=0;break;}
   cursor+=used;
  }
  if(!ok || *cursor) break;
  for(int i=0;i<erase;i++) {if(key(KEY_BACKSPACE,1)||key(KEY_BACKSPACE,0)) {ok=0;break;}}
  for(int i=0;ok && i<count;i++) {if(key(codes[i],values[i])) {ok=0;break;}
   struct timespec pace={0,2000000};nanosleep(&pace,NULL);
  }
  if(!ok) break;
 }
 return stopping?0:1;
}
